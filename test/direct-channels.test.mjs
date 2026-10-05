import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validateConfiguration,sendToTarget,deliverNotifications,startWechatLogin,pollWechatLogin,pullWechatSession,wechatBase} from '../plugin-packages/multi-platform-notify/main.js';
const now=Date.now();
const event={id:'course/fixture-1',kind:'class',title:'高等数学',body:'08:00 A101',sourceName:'课表',expiresAt:now+60000};
const qq={id:'qq-one',name:'我的 QQ',platform:'qq',mode:'direct',appId:'12345678',appSecret:'fixture-secret',targetType:'c2c',recipient:'abcdefgh12345678abcdefgh12345678',enabled:true,kinds:['class']};
const wechat={id:'wechat-one',name:'我的微信',platform:'wechat',mode:'direct',url:'https://ilinkai.weixin.qq.com',botToken:'fixture-bot-token',botId:'fixture-bot-id',recipient:'owner-id',contextToken:'bound-context',cursor:'initial-cursor',enabled:true,kinds:['class']};
function fixture(target,handler,sessions={}){
 const calls=[],receipts=[],saved=[];
 const ctx={calls,receipts,saved,now:()=>now,secureConfiguration:validateConfiguration({targets:[target]}),secureSessions:sessions,
 notifications:[{notification:event,targetIds:[target.id],receipts:[]}],
 notification:{async receipt(...args){receipts.push(args);return true;},async session(id,value){saved.push({id,value});return true;}},
 crypto:{async hmacSha256(key,text){return createHmac('sha256',key).update(text).digest('base64');}},
 network:{async fetch(url,options){const call={url,options,body:options.body?JSON.parse(options.body):null};calls.push(call);const value=await handler(call,calls.length);if(value?.raw)return value.raw;return{ok:true,status:200,json:async()=>value};}}};return ctx;
}
test('QQ 直接绑定使用机器人凭据和 OpenID，拒绝普通 QQ 号',()=>{
 const valid=validateConfiguration({targets:[qq]}).targets[0];assert.equal(valid.url,'https://api.sgroup.qq.com');
 assert.throws(()=>validateConfiguration({targets:[{...qq,recipient:'123456789'}]}),/OpenID/);
 assert.throws(()=>validateConfiguration({targets:[{...qq,appSecret:''}]}),/AppSecret/);
});
test('QQ 直接获取官方令牌、发送到对应 OpenID 并以消息 ID 确认',async()=>{
 const ctx=fixture(qq,({url})=>url.includes('getAppAccessToken')?{access_token:'fixture-access',expires_in:7200}:{id:'qq-msg-id'});
 await deliverNotifications(ctx);assert.equal(ctx.calls.length,2);
 assert.deepEqual(ctx.calls[0].body,{appId:qq.appId,clientSecret:qq.appSecret});
 assert.equal(ctx.calls[1].url,'https://api.sgroup.qq.com/v2/users/'+qq.recipient+'/messages');
 assert.equal(ctx.calls[1].options.headers.Authorization,'QQBot fixture-access');assert.equal(ctx.calls[1].body.msg_type,0);
 assert.ok(ctx.receipts.some(row=>row[2]==='sent'));assert.equal(ctx.saved[0].value.accessToken,'fixture-access');
});
test('QQ 复用有效令牌，明确鉴权拒绝后更新一次令牌再发送',async()=>{
 let sends=0;const ctx=fixture(qq,({url})=>url.includes('getAppAccessToken')?{access_token:'new-access',expires_in:7200}:++sends===1?{code:11253}:{id:'accepted-id'},{[qq.id]:{accessToken:'old-access',expiresAt:now+3600000}});
 await sendToTarget(ctx,ctx.secureConfiguration.targets[0],event);assert.equal(sends,2);assert.equal(ctx.calls.length,3);assert.equal(ctx.calls[2].options.headers.Authorization,'QQBot new-access');
});
test('QQ 平台拒绝、空回执和发送网络未知均不报告成功',async()=>{
 for(const result of [{code:22009},{},{raw:{ok:false,status:0,ambiguous:true}}]){
  const ctx=fixture(qq,()=>result,{[qq.id]:{accessToken:'cached',expiresAt:now+60000}});await deliverNotifications(ctx);
  assert.equal(ctx.calls.length,1);assert.equal(ctx.receipts.some(row=>row[2]==='sent'),false);
  assert.ok(ctx.receipts.some(row=>row[2]===(result.code?'failed':'unknown')));
 }
});
test('鉴权网络失败尚未发送消息，可重试，不能伪装成平台已收到',async()=>{
 const ctx=fixture(qq,()=>({raw:{ok:false,status:0,ambiguous:true}}));await deliverNotifications(ctx);
 assert.equal(ctx.calls.length,1);assert.ok(ctx.receipts.some(row=>row[2]==='failed'));assert.equal(ctx.receipts.some(row=>row[2]==='unknown'),false);
});
test('微信二维码、IDC 重定向和配对数字遵循腾讯接口，未知域名拒绝',async()=>{
 const ctx=fixture(wechat,({url})=>url.includes('get_bot_qrcode')?{qrcode:'fixture-qr',qrcode_img_content:'https://weixin.qq.com/fixture'}:{status:'confirmed',bot_token:'new-bot-token',ilink_bot_id:'new-bot-id',ilink_user_id:'owner-id',baseurl:'https://ilinkai.weixin.qq.com'});
 const login=await startWechatLogin(ctx);assert.equal(login.qrcode,'fixture-qr');assert.deepEqual(ctx.calls[0].body.local_token_list,[]);
 const result=await pollWechatLogin(ctx,login,'123456');assert.ok(ctx.calls[1].url.includes('verify_code=123456'));assert.equal(result.bot_token,'new-bot-token');
 assert.throws(()=>wechatBase('https://weixin.qq.com.evil.invalid'),/不支持/);
 assert.throws(()=>wechatBase('https://user:pass@ilinkai.weixin.qq.com'),/不支持/);
});
test('微信只采纳绑定收件人的私信会话，忽略其他账号和群消息',async()=>{
 const ctx=fixture(wechat,()=>({ret:0,get_updates_buf:'next-cursor',msgs:[{from_user_id:'intruder',context_token:'wrong'},{from_user_id:'owner-id',group_id:'group',context_token:'wrong-group'},{from_user_id:'owner-id',context_token:'fresh-owner-context'}]}));
 const session=await pullWechatSession(ctx,wechat);assert.equal(session.contextToken,'fresh-owner-context');assert.equal(session.cursor,'next-cursor');
});
test('微信更新并加密保存会话，直接发送，重试使用相同 client_id',async()=>{
 const ctx=fixture(wechat,({url})=>url.includes('getupdates')?{ret:0,get_updates_buf:'next-cursor',msgs:[{from_user_id:'owner-id',context_token:'fresh-context'}]}:{ret:0,message_id:'wechat-msg-id'});
 await sendToTarget(ctx,wechat,event);await sendToTarget(ctx,wechat,event);
 const sends=ctx.calls.filter(call=>call.url.includes('sendmessage'));assert.equal(sends.length,2);assert.equal(sends[0].body.msg.to_user_id,'owner-id');assert.equal(sends[0].body.msg.context_token,'fresh-context');assert.equal(sends[0].body.msg.client_id,sends[1].body.msg.client_id);
 assert.equal(sends[0].options.headers.Authorization,'Bearer fixture-bot-token');assert.equal(ctx.saved[0].value.cursor,'next-cursor');
});
test('微信读取长轮询超时可沿用已绑定会话，发送拒绝或无确认不标成功',async()=>{
 for(const result of [{ret:0},{ret:-14},{}]){
  const ctx=fixture(wechat,({url})=>url.includes('getupdates')?{raw:{ok:false,status:0,ambiguous:true}}:result);
  await deliverNotifications(ctx);assert.equal(ctx.calls.length,2);
  assert.equal(ctx.receipts.some(row=>row[2]==='sent'),result.ret===0);
  if(result.ret!==0)assert.ok(ctx.receipts.some(row=>row[2]===(result.ret?'failed':'unknown')));
 }
});
test('保存会话时绑定已变更，两个直接渠道都在发送前停止',async()=>{
 for(const target of [qq,wechat]){
  const ctx=fixture(target,({url})=>url.includes('getAppAccessToken')?{access_token:'access',expires_in:7200}:{ret:0});
  ctx.notification.session=async()=>false;await deliverNotifications(ctx);
  assert.equal(ctx.calls.some(call=>call.url.includes('/messages')||call.url.includes('sendmessage')),false);
 }
});

test('QQ 邮箱绑定需要授权码，发件人必须是 QQ 邮箱，收件人可以是其他邮箱',()=>{
 const mail={id:'mail-one',name:'我的邮箱',platform:'qqmail',mailFrom:'123456@qq.com',mailTo:'receiver@example.com',mailAuthCode:'abcd efgh ijkl mnop',enabled:true,kinds:['class']};
 const valid=validateConfiguration({targets:[mail]}).targets[0];assert.equal(valid.mailAuthCode,'abcdefghijklmnop');assert.equal(valid.url,'https://smtp.qq.com');
 for(const changed of [{mailFrom:'other@example.com'},{mailTo:'not-email'},{mailAuthCode:'password'}])assert.throws(()=>validateConfiguration({targets:[{...mail,...changed}]}));
});
test('QQ 邮件通过通用 TLS 传输发送，标题模式不传正文，只有服务器确认才成功',async()=>{
 const mail={id:'mail-one',name:'我的邮箱',platform:'qqmail',mailFrom:'123456@qq.com',mailTo:'receiver@example.com',mailAuthCode:'abcdefghijklmnop',enabled:true,kinds:['class'],includeBody:false};
 for(const result of [{ok:true,accepted:true},{ok:false,ambiguous:false,error:'SMTP 535'},{ok:false,ambiguous:true,error:'未确认'}]){
  const ctx=fixture(mail,()=>{throw new Error('must not use HTTP');});let sent;
  ctx.mail={async send(payload){sent=payload;return result;}};await deliverNotifications(ctx);
  assert.equal(sent.host,'smtp.qq.com');assert.equal(sent.port,465);assert.equal(sent.password,mail.mailAuthCode);assert.equal(sent.to,mail.mailTo);assert.ok(!sent.text.includes(event.body));
  assert.equal(ctx.receipts.some(row=>row[2]==='sent'),result.accepted===true);
  if(!result.ok)assert.ok(ctx.receipts.some(row=>row[2]===(result.ambiguous?'unknown':'failed')));
 }
});
