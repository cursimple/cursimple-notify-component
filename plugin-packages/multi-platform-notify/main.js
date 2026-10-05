// 平台协议只在本组件里实现；宿主只交出通用通知和受限传输能力。
const PLATFORMS = new Set(['feishu', 'wecom', 'dingtalk', 'wechat', 'qq', 'openclaw', 'webhook', 'qqmail', 'netease163', 'netease126', 'serverchan', 'pushplus', 'wxpusher', 'pushdeer', 'bark']);
const KINDS = new Set(['class', 'memo.due', 'component.new', 'component.due']);
export const WECHAT_BASE = 'https://ilinkai.weixin.qq.com';
const QQ_BASE = 'https://api.sgroup.qq.com';
export const MAIL_PROFILES = {
  qqmail:{name:'QQ 邮箱',host:'smtp.qq.com',domain:'qq.com',domains:['qq.com','foxmail.com','vip.qq.com'],minCode:16},
  netease163:{name:'网易 163 邮箱',host:'smtp.163.com',domain:'163.com',domains:['163.com'],minCode:6},
  netease126:{name:'网易 126 邮箱',host:'smtp.126.com',domain:'126.com',domains:['126.com'],minCode:6},
};
const EXTRA_PUSH = new Set(['serverchan','pushplus','wxpusher','pushdeer','bark']);
const LOCAL_SESSIONS = new WeakMap();
const localSession = (ctx,target) => LOCAL_SESSIONS.get(ctx)?.[target.id] || ctx.secureSessions?.[target.id] || {};
export function serverchanUrl(key) {
  if (/^SCT[A-Za-z0-9_-]{8,500}$/.test(key)) return `https://sctapi.ftqq.com/${key}.send`;
  const match = /^sctp([0-9]{1,16})t[A-Za-z0-9_-]{8,500}$/.exec(key);
  if (match) return `https://${match[1]}.push.ft07.com/send/${key}.send`;
  throw new Error('请填写 SCT 或 sctp 开头的 Server酱 SendKey');
}
function validateExtra(target) {
  if(!EXTRA_PUSH.has(target.platform))return;
  if(typeof target.token!=='string'||!/^[A-Za-z0-9_-]{8,512}$/.test(target.token))throw new Error('请填写该平台提供的推送密钥');
  if(target.platform==='serverchan')target.url=new URL(serverchanUrl(target.token)).origin;
  if(target.platform==='pushplus'){
    target.url='https://www.pushplus.plus/send';
    if(target.topic&&!/^[A-Za-z0-9_-]{1,100}$/.test(target.topic))throw new Error('PushPlus 群组编码无效');
    if(target.querySecret&&(!/^[A-Za-z0-9_-]{16,256}$/.test(target.querySecret)))throw new Error('PushPlus 查询密钥无效');
  }
  if(target.platform==='wxpusher'){
    target.url='https://wxpusher.zjiecode.com/api/send/message';
    if(!/^AT_[A-Za-z0-9_-]{5,200}$/.test(target.token))throw new Error('WxPusher 需要应用 AppToken');
    if(!/^UID_[A-Za-z0-9_-]{5,200}$/.test(target.uid||''))throw new Error('请填写已订阅此应用的用户 UID');
  }
  if(target.platform==='pushdeer')target.url=target.url||'https://api2.pushdeer.com/message/push';
  if(target.platform==='bark')target.url=target.url||'https://api.day.app/push';
}
class ReceiptStatus extends Error {constructor(status,message){super(message);this.receiptStatus=status;}}
const waiting = message => {throw new ReceiptStatus('queued',message||'服务已接收，等待平台确认发送');};
const accepted = message => {throw new ReceiptStatus('accepted',message||'平台已接收请求，请在接收平台核对');};
const requestPush = (ctx,url,body) => channelRequest(ctx,url,{body,headers:{'Content-Type':'application/json'},mayDeliver:true});
function pendingRef(ctx,target,event) {return localSession(ctx,target).pending?.[event.id];}
async function rememberPending(ctx,target,event,value,afterSend=false) {
  if(typeof ctx.notification?.session!=='function')throw new ChannelError('请更新支持异步结果跟踪的课简');
  const session={...localSession(ctx,target)},pending={...session.pending};
  for(const [id,ref]of Object.entries(pending))if(ref.expiresAt<=ctx.now())delete pending[id];
  if(value)pending[event.id]={...value,expiresAt:event.expiresAt};else delete pending[event.id];
  if(Object.keys(pending).length>16||JSON.stringify(pending).length>9000)throw new ChannelError('此目标等待确认的消息过多，请稍后重试');
  try{await saveSession(ctx,target,{...session,pending});}catch(error){if(afterSend)throw new ChannelError('平台已接收，但跟踪记录未保存，请先核对平台',true);throw error;}
}
async function pushplusAccess(ctx,target,force=false) {
  const session=localSession(ctx,target);
  if(!force&&session.accessKey&&session.accessExpiresAt>ctx.now())return session.accessKey;
  const result=await channelRequest(ctx,'https://www.pushplus.plus/api/common/openApi/getAccessKey',{body:{token:target.token,secretKey:target.querySecret},headers:{'Content-Type':'application/json'}});
  if(result.code!==200||typeof result.data?.accessKey!=='string'||!(Number(result.data.expiresIn)>0))throw new ChannelError('查询授权未通过，请检查 PushPlus 开放接口、查询密钥和安全 IP');
  await saveSession(ctx,target,{...localSession(ctx,target),accessKey:result.data.accessKey,accessExpiresAt:ctx.now()+Number(result.data.expiresIn)*1000-60000});
  return result.data.accessKey;
}
async function queryPushplus(ctx,target,event,ref) {
  if(!target.querySecret)accepted('PushPlus 已接收，未启用结果查询；请到平台日志核对');
  try{
    let key=await pushplusAccess(ctx,target);
    const url='https://www.pushplus.plus/api/open/message/sendMessageResult?shortCode='+encodeURIComponent(ref.shortCode);
    let value=await channelRequest(ctx,url,{headers:{'access-key':key}});
    if([401,403].includes(value.code)){key=await pushplusAccess(ctx,target,true);value=await channelRequest(ctx,url,{headers:{'access-key':key}});}
    if(value.code!==200)waiting('消息已提交，结果查询未通过，请检查查询权限');
    if(value.data?.status===2){await rememberPending(ctx,target,event,null,true);return;}
    if(value.data?.status===3){await rememberPending(ctx,target,event,null,true);throw new ChannelError('PushPlus 确认发送失败，请到平台日志检查接收渠道和额度');}
    if([0,1].includes(value.data?.status))waiting('PushPlus 正在处理，后台将继续查询');
    waiting('PushPlus 返回了未识别的查询状态，保留记录等待核对');
  }catch(error){
    if(error.receiptStatus||error instanceof ChannelError&&error.message.startsWith('PushPlus 确认发送失败'))throw error;
    waiting('消息已提交，查询暂未完成；请检查查询权限或稍后刷新');
  }
}
async function sendPushplus(ctx,target,event,text,force,receipt) {
  let ref=pendingRef(ctx,target,event);
  if(ref?.shortCode)return queryPushplus(ctx,target,event,ref);
  if(ref?.phase==='sending'&&!force)throw new ChannelError('上次提交结果未知，请先在 PushPlus 核对',true);
  if(['queued','querying','accepted'].includes(receipt?.status))throw new ChannelError('跟踪记录不可用，请到 PushPlus 核对；不会重复提交',true);
  await rememberPending(ctx,target,event,{phase:'sending'});
  let result;
  try{result=await requestPush(ctx,target.url,{token:target.token,title:event.title,content:text,template:'txt',channel:'wechat',...(target.topic?{topic:target.topic}:{}),timestamp:event.expiresAt});}
  catch(error){if(!error.unknown)await rememberPending(ctx,target,event,null);throw error;}
  if(result.code!==200){await rememberPending(ctx,target,event,null);throw new ChannelError(`PushPlus 拒绝请求（${result.code??'无确认码'}），请检查 Token、订阅和额度`);}
  if(typeof result.data!=='string'||!result.data||!/^[A-Za-z0-9_-]{1,128}$/.test(result.data))throw new ChannelError('PushPlus 未返回流水号，请到平台核对',true);
  if(!target.querySecret){await rememberPending(ctx,target,event,null,true);accepted('PushPlus 已接收，未启用结果查询；请到平台日志核对');}
  ref={phase:'queued',shortCode:result.data};await rememberPending(ctx,target,event,ref,true);
  return queryPushplus(ctx,target,event,ref);
}
async function sendExtra(ctx,target,event,text,force,receipt) {
  if(target.platform==='pushplus')return sendPushplus(ctx,target,event,text,force,receipt);
  if(target.platform==='serverchan'){
    const result=await requestPush(ctx,serverchanUrl(target.token),{title:[...event.title].slice(0,32).join(''),desp:text});
    if(result.code!==0||result.data?.errno!=null&&result.data.errno!==0)throw new DeliveryError(`Server酱 拒绝请求（${result.code??result.data?.errno??'无确认码'}），请检查 SendKey 和额度`);
    accepted('Server酱 已接收，请到所选接收通道核对');
  }
  if(target.platform==='wxpusher'){
    const result=await requestPush(ctx,target.url,{appToken:target.token,content:text,summary:[...event.title].slice(0,100).join(''),contentType:1,uids:[target.uid]});
    if(result.code!==1000||result.success===false)throw new DeliveryError(`WxPusher 拒绝请求（${result.code??'无确认码'}），请检查 AppToken 和应用订阅`);
    const row=Array.isArray(result.data)?result.data.find(item=>item.uid===target.uid):null;
    if(!row)throw new DeliveryError('WxPusher 未确认此用户的发送任务，请到平台核对',true);
    if(row.code!==1000)throw new DeliveryError(`WxPusher 未接受此用户（${row.code??'无确认码'}），请检查订阅`);
    if(!row.sendRecordId&&!row.messageId)throw new DeliveryError('WxPusher 未返回发送记录，请到平台核对',true);
    accepted('WxPusher 已创建发送任务，请在接收端核对');
  }
  if(target.platform==='bark'){
    const result=await requestPush(ctx,target.url,{device_key:target.token,title:event.title,body:truncateUtf8(text,2800),group:'课简'});
    if(result.code!==200)throw new DeliveryError(`Bark 未接受通知（${result.code??'无确认码'}），请检查设备 Key 和服务地址`);
    return;
  }
  if(target.platform==='pushdeer'){
    const result=await requestPush(ctx,target.url,{pushkey:target.token,text:truncateUtf8(text,2800),type:'text'});
    if(result.code!==0)throw new DeliveryError(`PushDeer 拒绝请求（${result.code??'无确认码'}），请检查 PushKey`);
    const rows=Array.isArray(result.content?.result)?result.content.result:[];
    if(!rows.length)throw new DeliveryError('PushDeer 没有返回设备确认，请检查接收设备',true);
    for(const raw of rows){let row;try{row=typeof raw==='string'?JSON.parse(raw):raw;}catch{throw new DeliveryError('PushDeer 设备回执无法识别，请到平台核对',true);}
      if(!row||row.success!=='ok'||!(Number(row.counts)>0)||row.logs?.some(item=>item.error))throw new DeliveryError('PushDeer 未确认全部接收设备，请在平台核对',true);
    }
  }
}

const isDirect = target => ['qq','wechat'].includes(target.platform) && target.mode !== 'relay' && !target.routeId;
export function wechatBase(value = WECHAT_BASE) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || (url.hostname !== 'weixin.qq.com' && !url.hostname.endsWith('.weixin.qq.com'))) throw new Error('微信返回了不支持的服务地址');
  return url.origin;
}
export function wechatHeaders(token = '') {
  const headers = {'Content-Type':'application/json',AuthorizationType:'ilink_bot_token','iLink-App-Id':'bot','iLink-App-ClientVersion':'132105','X-WECHAT-UIN':btoa(String(Math.floor(Math.random()*4294967296)))};
  if (token) headers.Authorization = 'Bearer '+token;
  return headers;
}
const baseInfo = () => ({channel_version:'2.4.9',bot_agent:'CurSimple/1.2.0'});
export class ChannelError extends Error { constructor(message, unknown = false, code = null) { super(message);this.unknown=unknown;this.code=code; } }
export async function channelRequest(ctx,url,{body,headers={},method=body===undefined?'GET':'POST',timeoutMs=20000,mayDeliver=false}={}) {
  const response = await ctx.network.fetch(url,{method,headers,body:body===undefined?'':JSON.stringify(body),timeoutMs});
  if (response.ambiguous) throw Object.assign(new ChannelError(mayDeliver?'网络结果未确认，请在平台核对后重试':'平台网络暂不可用，请稍后重试',mayDeliver),{network:true});
  let value;try{value=await response.json();}catch{throw new ChannelError('平台未返回有效回执，请核对后重试',mayDeliver);}
  if (!response.ok) throw new ChannelError(`平台请求被拒绝（HTTP ${response.status}，代码 ${value.code??value.ret??'无'}）`,mayDeliver&&(response.status>=500||response.status===408),value.code??response.status);
  return value;
}
export async function qqAccessToken(ctx,target) {
  const value=await channelRequest(ctx,'https://bots.qq.com/app/getAppAccessToken',{body:{appId:target.appId,clientSecret:target.appSecret},headers:{'Content-Type':'application/json'}});
  if (typeof value.access_token!=='string'||!value.access_token||!(Number(value.expires_in)>0)) throw new ChannelError(`QQ 机器人授权失败（${value.code??'无有效令牌'}），请检查 AppID 和 AppSecret`);
  return {accessToken:value.access_token,expiresAt:ctx.now()+Number(value.expires_in)*1000-60000};
}
export async function startWechatLogin(ctx,tokens=[]) {
  const value=await channelRequest(ctx,WECHAT_BASE+'/ilink/bot/get_bot_qrcode?bot_type=3',{body:{local_token_list:tokens.slice(0,10)},headers:wechatHeaders()});
  if (typeof value.qrcode!=='string'||typeof value.qrcode_img_content!=='string'||!value.qrcode||!value.qrcode_img_content) throw new ChannelError('微信未返回可用二维码，请稍后重试');
  return {qrcode:value.qrcode,content:value.qrcode_img_content,base:WECHAT_BASE};
}
export async function pollWechatLogin(ctx,login,verifyCode='') {
  let endpoint=wechatBase(login.base)+'/ilink/bot/get_qrcode_status?qrcode='+encodeURIComponent(login.qrcode);
  if(verifyCode)endpoint+='&verify_code='+encodeURIComponent(verifyCode);
  const value=await channelRequest(ctx,endpoint,{headers:wechatHeaders(),timeoutMs:40000});
  if(value.status==='scaned_but_redirect')return {...value,base:wechatBase('https://'+value.redirect_host)};
  if(value.status==='confirmed'){
    if([value.bot_token,value.ilink_bot_id,value.ilink_user_id].some(v=>typeof v!=='string'||!v||v.length>4096))throw new ChannelError('微信确认信息不完整，请重新扫码');
    return {...value,base:wechatBase(value.baseurl||WECHAT_BASE)};
  }
  return value;
}
export async function pullWechatSession(ctx,target,session={},timeoutMs=1500) {
  const base=wechatBase(target.url),cursor=session.cursor??target.cursor??'';
  let value;
  try{value=await channelRequest(ctx,base+'/ilink/bot/getupdates',{body:{get_updates_buf:cursor,base_info:baseInfo()},headers:wechatHeaders(target.botToken),timeoutMs});}
  catch(error){if(error.network)return {...session,contextToken:session.contextToken||target.contextToken,cursor};throw error;}
  if((value.ret??0)!==0||(value.errcode??0)!==0)throw new ChannelError(`微信会话读取失败（${value.errcode??value.ret}），请重新扫码或在微信中向已连接的机器人发一条消息`);
  const result={...session,cursor:value.get_updates_buf??cursor,contextToken:session.contextToken||target.contextToken};
  for(const message of value.msgs||[])if(!message.group_id&&message.from_user_id===target.recipient&&message.context_token)result.contextToken=message.context_token;
  return result;
}
async function saveSession(ctx,target,value) {
  if(ctx.notification?.session&&await ctx.notification.session(target.id,value)===false)throw new ChannelError('绑定已修改，停止使用旧配置发送');
  const local=LOCAL_SESSIONS.get(ctx)||{};local[target.id]=value;LOCAL_SESSIONS.set(ctx,local);
}
async function sendDirect(ctx,target,event,text) {
  if(target.platform==='qq'){
    let session=ctx.secureSessions?.[target.id]||{};
    if(!session.accessToken||session.expiresAt<=ctx.now()){session=await qqAccessToken(ctx,target);await saveSession(ctx,target,session);}
    const path=target.targetType==='group'?'groups':'users';
    const post=async()=>{
      const result=await channelRequest(ctx,`${QQ_BASE}/v2/${path}/${encodeURIComponent(target.recipient)}/messages`,{headers:{Authorization:'QQBot '+session.accessToken,'Content-Type':'application/json'},mayDeliver:true,body:{content:truncateUtf8(text,3500),msg_type:0}});
      if(result.code&&result.code!==0)throw new ChannelError(`QQ 拒绝通知（${result.code}）。请检查机器人主动消息权限、配额及近期互动`,false,result.code);
      if(typeof result.id!=='string'||!result.id)throw new ChannelError('QQ 未返回消息 ID，发送结果需核对',true);
    };
    try{await post();}catch(error){
      // 只在明确的鉴权拒绝后重新取令牌，不重发未知结果或配额拒绝。
      if(![401,11253,40014].includes(error.code)||error.unknown)throw error;
      session=await qqAccessToken(ctx,target);await saveSession(ctx,target,session);await post();
    }
    return;
  }
  const session=await pullWechatSession(ctx,target,ctx.secureSessions?.[target.id]);
  if(!session.contextToken)throw new ChannelError('微信尚无可用会话，请向扫码连接的机器人发一条消息后重新绑定');
  await saveSession(ctx,target,session);
  const digest=await ctx.crypto.hmacSha256('CurSimple/'+target.id,event.id);
  const result=await channelRequest(ctx,wechatBase(target.url)+'/ilink/bot/sendmessage',{mayDeliver:true,headers:wechatHeaders(target.botToken),body:{base_info:baseInfo(),msg:{from_user_id:'',to_user_id:target.recipient,client_id:'cursimple-'+digest.replace(/[+/=]/g,'_'),message_type:2,message_state:2,item_list:[{type:1,text_item:{text:truncateUtf8(text,3500)}}],context_token:session.contextToken}}});
  if((result.ret??0)!==0||(result.errcode??0)!==0)throw new ChannelError(`微信拒绝通知（${result.errcode??result.ret}），请重新扫码或向已连接的机器人发送消息`);
  if(result.ret!==0&&!result.message_id)throw new ChannelError('微信未返回发送确认，结果需核对',true);
}


export function validateConfiguration(input) {
  const targets = input?.targets;
  if (!Array.isArray(targets)) throw new Error('请先完成通知目标绑定');
  if (targets.length > 12) throw new Error('最多绑定 12 个通知目标');
  const seen = new Set();
  return { targets: targets.map(raw => {
    const target = { ...raw, name: String(raw.name || '').trim(), url: String(raw.url || '').trim() };
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(target.id) || seen.has(target.id)) throw new Error('通知目标标识无效');
    seen.add(target.id);
    if (!PLATFORMS.has(target.platform) || !target.name || target.name.length > 80) throw new Error('请填写目标名称并选择平台');
    validateExtra(target);
    if (MAIL_PROFILES[target.platform]) {
      const mail=MAIL_PROFILES[target.platform];
      target.url = 'https://'+mail.host;
      if (typeof target.mailFrom !== 'string' || /\s/.test(target.mailFrom) || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(target.mailFrom) || !mail.domains.includes(target.mailFrom.split('@')[1].toLowerCase())) throw new Error('请填写发件 '+mail.name+'地址');
      if (typeof target.mailTo !== 'string' || /\s/.test(target.mailTo) || target.mailTo.length>254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(target.mailTo)) throw new Error('请填写有效的收件邮箱');
      target.mailAuthCode = typeof target.mailAuthCode === 'string' ? target.mailAuthCode.replace(/\s+/g,'') : '';
      if (!new RegExp('^[A-Za-z0-9]{'+mail.minCode+',64}$').test(target.mailAuthCode)) throw new Error('请填写 '+mail.name+'的 SMTP 授权码，不能使用邮箱登录密码');
    }
    if (isDirect(target)) {
      target.mode = 'direct';
      if (target.platform === 'qq') {
        target.url = QQ_BASE;
        if (!/^[0-9]{5,24}$/.test(target.appId||'') || !target.appSecret) throw new Error('请填写 QQ 机器人的 AppID 和 AppSecret');
        if (!['c2c','group'].includes(target.targetType) || !/^[A-Za-z0-9_-]{16,128}$/.test(target.recipient||'')) throw new Error('请获取或填写该机器人对应的收件人 OpenID，普通 QQ 号不能作为 OpenID');
      } else {
        target.url = wechatBase(target.url||WECHAT_BASE);
        if ([target.botToken,target.botId,target.recipient,target.contextToken].some(v=>typeof v!=='string'||!v||v.length>4096||/[\x00-\x1f\x7f]/.test(v))) throw new Error('请扫码连接微信，并向连接的机器人发消息完成会话绑定');
      }
    }
    let url;
    try { url = new URL(target.url); } catch { throw new Error('请填写完整的 HTTPS 地址'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('通知地址需要 HTTPS，且不能含账号或片段');
    if (target.platform === 'feishu' && (url.hostname !== 'open.feishu.cn' || !url.pathname.startsWith('/open-apis/bot/v2/hook/'))) throw new Error('请填写飞书群机器人的 Webhook 地址');
    if (target.platform === 'wecom' && (url.hostname !== 'qyapi.weixin.qq.com' || url.pathname !== '/cgi-bin/webhook/send' || !url.searchParams.get('key'))) throw new Error('请填写企业微信群机器人的 Webhook 地址');
    if (target.platform === 'dingtalk' && (url.hostname !== 'oapi.dingtalk.com' || url.pathname !== '/robot/send' || !url.searchParams.get('access_token'))) throw new Error('请填写钉钉群机器人的 Webhook 地址');
    if ((!isDirect(target) && ['wechat','qq','openclaw'].includes(target.platform)) && (!target.routeId || !/^[A-Za-z0-9_-]{1,64}$/.test(target.routeId))) throw new Error('请填写 OpenClaw 桥接服务中的路由 ID');
    if ((!isDirect(target) && ['wechat','qq','openclaw'].includes(target.platform)) && !String(target.token || '').trim()) throw new Error('请填写桥接服务的访问令牌');
    if (!Array.isArray(target.kinds) || target.kinds.some(x => !KINDS.has(x)) || target.kinds.length === 0) throw new Error('至少选择一种通知');
    if ([target.secret, target.token, target.appSecret, target.mailAuthCode, target.querySecret, target.botToken, target.contextToken].some(x => x != null && (typeof x !== 'string' || x.length > 4096 || /[\x00-\x1f\x7f]/.test(x)))) throw new Error('密钥格式无效');
    target.enabled = target.enabled !== false;
    return target;
  }) };
}

export function configurationEnvelope(values) {
  const config = validateConfiguration(values);
  return { values: config, hosts: [...new Set(config.targets.map(x => new URL(x.url).hostname))],
    targets: config.targets.map(({id,name,enabled,kinds}) => ({id,name,enabled,kinds})) };
}

export function formatNotification(event, includeBody = true) {
  return ['课简 · ' + (event.sourceName || '通知'), event.title || '新通知', includeBody ? event.body : ''].filter(Boolean).join('\n');
}

function truncateUtf8(text, limit) {
  let output = '', size = 0;
  const encoder = new TextEncoder();
  for (const character of text) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > limit - 3) return output + '…';
    output += character; size += bytes;
  }
  return output;
}

class DeliveryError extends Error {
  constructor(message, unknown = false) { super(message); this.unknown = unknown; }
}

async function request(ctx, url, body, headers = {}) {
  const response = await ctx.network.fetch(url, { method:'POST', headers:{'Content-Type':'application/json', ...headers}, body:JSON.stringify(body) });
  if (response.ambiguous) throw new DeliveryError('发送结果未确认，请先在平台核对再手动重试', true);
  if (!response.ok) throw new DeliveryError(`平台请求失败（HTTP ${response.status}）`);
  let result;
  try { result = await response.json(); } catch { throw new DeliveryError('平台没有返回可识别的确认，需核对后重试', true); }
  return result;
}

export async function sendToTarget(ctx, target, event, force = false, receipt = null) {
  const text = [target.keyword, formatNotification(event, target.includeBody !== false)].filter(Boolean).join('\n');
  const timestamp = String(Math.floor(ctx.now() / 1000));
  if (EXTRA_PUSH.has(target.platform)) {
    await sendExtra(ctx,target,event,text,force,receipt);
  } else if (MAIL_PROFILES[target.platform]) {
    const digest = await ctx.crypto.hmacSha256('CurSimple/'+target.id,event.id);
    const result = await ctx.mail.send({host:MAIL_PROFILES[target.platform].host,port:465,username:target.mailFrom,password:target.mailAuthCode,from:target.mailFrom,to:target.mailTo,subject:'[课简] '+event.title,text,messageId:'cursimple-'+digest.replace(/[+/=]/g,'_')});
    if (result.ok !== true || result.accepted !== true) throw new DeliveryError(result.error||'邮件服务器尚未确认接收',result.ambiguous===true);
  } else if (isDirect(target)) {
    await sendDirect(ctx,target,event,text);
  } else if (target.platform === 'feishu') {
    const body = {msg_type:'text',content:{text:truncateUtf8(text, 6000)}};
    if (target.secret) { body.timestamp = timestamp; body.sign = await ctx.crypto.hmacSha256(timestamp+'\n'+target.secret, ''); }
    const response = await request(ctx, target.url, body);
    if ((response.code ?? response.StatusCode) !== 0) throw new DeliveryError(`飞书未接受消息（${response.code ?? response.StatusCode ?? '无确认码'}），请检查 Webhook、关键词和签名设置`);
  } else if (target.platform === 'wecom') {
    const response = await request(ctx, target.url, {msgtype:'text',text:{content:truncateUtf8(text, 1800)}});
    if (response.errcode !== 0) throw new DeliveryError(`企业微信未接受消息（${response.errcode ?? '无确认码'}），请检查机器人绑定`);
  } else if (target.platform === 'dingtalk') {
    const url = new URL(target.url);
    if (target.secret) {
      const ms = String(ctx.now());
      url.searchParams.set('timestamp', ms);
      url.searchParams.set('sign', await ctx.crypto.hmacSha256(target.secret, ms+'\n'+target.secret));
    }
    const response = await request(ctx, url.href, {msgtype:'text',text:{content:truncateUtf8(text, 3500)}});
    if (response.errcode !== 0) throw new DeliveryError(`钉钉未接受消息（${response.errcode ?? '无确认码'}），请检查关键词和签名设置`);
  } else if ((!isDirect(target) && ['wechat','qq','openclaw'].includes(target.platform))) {
    const response = await request(ctx, target.url, {id:event.id,routeId:target.routeId,platform:target.platform,force,notification:{...event,body:target.includeBody === false?'':event.body}}, {Authorization:'Bearer '+target.token});
    if (response.ok !== true || response.delivered !== true) throw new DeliveryError('OpenClaw 尚未确认发送，请检查渠道登录与路由', response.unknown === true);
  } else {
    const response = await request(ctx, target.url, {...event,body:target.includeBody === false?'':event.body}, target.token ? {Authorization:'Bearer '+target.token} : {});
    if (response.ok !== true) throw new DeliveryError('Webhook 需返回 {"ok":true} 才能确认发送');
  }
}

/** 收件人成功后先保存回执，再处理下一个目标；重试跳过已送达目标。 */
export async function deliverNotifications(ctx) {
  const config = validateConfiguration(ctx.secureConfiguration);
  const targets = new Map(config.targets.map(x => [x.id,x]));
  let delivered = 0, failed = 0, queued = 0, acceptedCount = 0;
  for (const row of ctx.notifications || []) {
    const event = row.notification;
    const finished = new Set((row.receipts || []).filter(x => ['sent','accepted','skipped','unknown'].includes(x.status)).map(x => x.targetId));
    const pending = [...row.targetIds].filter(id => !finished.has(id));
    let cursor = 0;
    await Promise.all(Array.from({length:Math.min(4,pending.length)}, async () => {
      while (cursor < pending.length) {
        const id = pending[cursor++], target = targets.get(id);
        if (!target || (event.kind !== 'test' && (!target.enabled || !target.kinds.includes(event.kind)))) {
          await ctx.notification.receipt(event.id,id,'skipped','目标已停用或不接收此类通知');continue;
        }
        if (event.expiresAt <= ctx.now()) { await ctx.notification.receipt(event.id,id,'skipped','通知已过期');continue; }
        const receipt=(row.receipts||[]).find(x=>x.targetId===id);
        const querying=!!pendingRef(ctx,target,event)?.shortCode||['queued','querying'].includes(receipt?.status);
        if (await ctx.notification.receipt(event.id,id,querying?'querying':'sending','') === false) continue;
        let accepted = false;
        try {
          await sendToTarget(ctx,target,event,row.manualRetry === true,receipt);
          accepted = true;
          await ctx.notification.receipt(event.id,id,'sent','');delivered++;
        } catch(error) {
          if(error.receiptStatus){await ctx.notification.receipt(event.id,id,error.receiptStatus,error.message);if(error.receiptStatus==='queued')queued++;else acceptedCount++;continue;}
          await ctx.notification.receipt(event.id,id,(accepted || error.unknown)?'unknown':'failed',accepted?'平台已接受，但回执保存未确认，请核对后重试':error.message || '发送未完成');failed++;
        }
      }
    }));
  }
  return {delivered,failed,...(queued?{queued}:{}),...(acceptedCount?{accepted:acceptedCount}:{})};
}

export async function checkLogin() { return {loggedIn:true}; }
export async function sync() { return {items:[]}; }
export const __test__ = {truncateUtf8};
