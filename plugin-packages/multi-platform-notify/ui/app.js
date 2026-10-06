import {configurationEnvelope,validateConfiguration,MAIL_PROFILES,WECHAT_BASE,startWechatLogin,pollWechatLogin,pullWechatSession,qqAccessToken,channelRequest} from '../main.js';
import {bindSegments,segmentPosition,createSheets} from './interactions.js';
const sdk = window.CurSimpleComponent;
const app = document.getElementById('app');
const clone = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {send:'M22 2 9 15M22 2l-7 20-6-7-7-6 20-7Z',plus:'M12 5v14M5 12h14',refresh:'M20 6v5h-5M4 18v-5h5M6 7a7 7 0 0 1 14 4M18 17a7 7 0 0 1-14-4',help:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9.5 9a2.5 2.5 0 1 1 4 2l-1.5 1v2M12 17h.01',close:'m6 6 12 12M6 18 18 6',check:'m5 12 5 5L20 7',chevron:'m6 9 6 6 6-6',bell:'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',alert:'M12 4 2.5 20h19L12 4ZM12 10v4M12 17h.01'};
paths.info='M12 11v6M12 7h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z';
const icon = name=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]}"/></svg>`;
const kinds = {'class':'上课提醒','memo.due':'笔记待办到期','component.new':'组件新内容','component.due':'组件截止提醒'};
const kindHints = {'class':'课程开始前的提醒','memo.due':'笔记待办截止前 24 小时提醒一次','component.new':'组件同步到的新通知和新任务','component.due':'组件任务临近截止时提醒'};
const brand = {wechat:'#07a35a',qq:'#12a4e0',feishu:'#3370ff',wecom:'#2b7bf0',dingtalk:'#1b8cf2',serverchan:'#e5484d',pushplus:'#e08a00',wxpusher:'#119a9a',pushdeer:'#7c5cff',bark:'#f0642f',qqmail:'#3b82f6',netease163:'#d93a3a',netease126:'#d93a3a',openclaw:'#8b5cf6',webhook:'#64748b'};
const markTile = (id,cls='platform') => `<span class="${cls}" style="${brand[id]?`--brand:${brand[id]};--tint:${brand[id]}24`:''}">${esc(platforms[id]?.mark||'?')}</span>`;
const resultText = {accepted:'平台已接收',queued:'等待平台结果',querying:'正在查询',sent:'已发送',failed:'失败',unknown:'结果未确认',skipped:'已跳过',sending:'正在发送'};
const platforms = {
 wechat:{name:'个人微信',mark:'微',hint:'扫码连接腾讯微信机器人，向它发一条消息绑定私信会话。',direct:true},
 qq:{name:'QQ 机器人',mark:'Q',hint:'绑定官方机器人凭据，再获取接收者 OpenID。主动消息受平台权限和近期互动条件限制。',direct:true},
 feishu:{name:'飞书',mark:'飞',url:'https://open.feishu.cn/open-apis/bot/v2/hook/…',hint:'在飞书群添加自定义机器人，复制 Webhook；按群设置填写签名和关键词。',sign:true,keyword:true},
 wecom:{name:'企业微信',mark:'企',url:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…',hint:'在企业微信群创建消息推送，复制 Webhook。'},
 dingtalk:{name:'钉钉',mark:'钉',url:'https://oapi.dingtalk.com/robot/send?access_token=…',hint:'创建群机器人，并按安全设置填写加签密钥或关键词。',sign:true,keyword:true},
 serverchan:{doc:"https://sct.ftqq.com/sendkey/",name:'Server酱 / Server酱³',mark:'S',hint:'在 Server酱 获取 SendKey，并配置接收通道。支持 SCT 和 sctp 两种密钥，额度以平台账号为准。',push:true,tokenLabel:'SendKey',tokenHint:'SCT… 或 sctp…',search:'serverchan 方糖 server酱 微信 ftqq ft07'},
 pushplus:{doc:"https://www.pushplus.plus/",name:'PushPlus 推送加',mark:'P',hint:'填写推送 Token，默认发给自己；群组需先在平台创建并订阅。消息进入队列后会单独显示接收阶段。',push:true,tokenLabel:'推送 Token',tokenHint:'用户 Token 或消息 Token',search:'pushplus 推送加 微信'},
 wxpusher:{doc:"https://wxpusher.zjiecode.com/admin/",name:'WxPusher',mark:'W',hint:'创建应用取得 AppToken，接收者订阅该应用后填写 UID。客户端或微信通道在 WxPusher 内配置。',push:true,tokenLabel:'应用 AppToken',tokenHint:'AT_…',search:'wxpusher 微信 客户端'},
 pushdeer:{doc:"https://www.pushdeer.com/",name:'PushDeer',mark:'鹿',hint:'在 PushDeer 接收客户端获取 PushKey。可使用官方服务或填写自己的 HTTPS 服务。',push:true,tokenLabel:'PushKey',tokenHint:'接收设备的 PushKey',endpoint:'https://api2.pushdeer.com/message/push',search:'pushdeer 推送鹿'},
 bark:{doc:"https://bark.day.app/",name:'Bark（iOS 接收端）',mark:'B',hint:'在安装 Bark 的 iPhone / iPad 中取得设备 Key。可使用官方服务或自建 HTTPS 服务。',push:true,tokenLabel:'设备 Key',tokenHint:'Bark 设备 Key',endpoint:'https://api.day.app/push',search:'bark ios iphone ipad 苹果'},
 qqmail:{name:'QQ 邮箱',mark:'邮',hint:'在 QQ 邮箱开启 SMTP 并生成授权码，填入发件和收件邮箱。',smtp:MAIL_PROFILES.qqmail},
 netease163:{doc:"https://mail.163.com/",name:'网易 163 邮箱',mark:'易',hint:'在网易邮箱开启 SMTP，并生成客户端授权码。',smtp:MAIL_PROFILES.netease163,search:'网易 163 netease mail 邮箱'},
 netease126:{doc:"https://mail.126.com/",name:'网易 126 邮箱',mark:'易',hint:'在网易邮箱开启 SMTP，并生成客户端授权码。',smtp:MAIL_PROFILES.netease126,search:'网易 126 netease mail 邮箱'},
 openclaw:{name:'其他 OpenClaw 渠道',mark:'O',hint:'使用已有桥接服务，选择已绑定渠道和收件人。',relay:true},
 webhook:{name:'自建 Webhook',mark:'↗',hint:'接收统一 JSON 通知的 HTTPS 服务，成功需返回 {"ok":true}。',token:true},
};
const platformGroups=[
 {name:'聊天与协作',ids:['wechat','qq','feishu','wecom','dingtalk']},
 {name:'推送服务',ids:['serverchan','pushplus','wxpusher','pushdeer','bark']},
 {name:'邮箱',ids:['qqmail','netease163','netease126']},
 {name:'其他',ids:['openclaw','webhook']},
];
function platformMenu(draft){return `<label class="platform-search"><span class="sr-only">搜索平台</span><input id="platform-search" type="search" placeholder="搜索平台，例如：微信、网易、Bark" autocomplete="off"></label><div class="platform-options">${platformGroups.map(g=>`<section data-platform-group><h3>${g.name}</h3>${g.ids.map(id=>{const p=platforms[id];return `<button type="button" role="option" aria-selected="${id===draft.platform}" data-platform="${id}" data-search="${esc([p.name,p.search||'',id].join(' ').toLowerCase())}" class="${id===draft.platform?'on':''}">${markTile(id,'platform mini')}<span class="grow">${esc(p.name)}</span>${id===draft.platform?icon('check'):''}</button>`;}).join('')}</section>`).join('')}<p id="platform-empty" class="hint" hidden>没有匹配的平台</p></div>`;}

let state=sdk?.state, config={targets:[]}, history=[], tab='targets', loaded=false, busy=false, error='', timer, toastHide, refreshing=false, historyRequest=null;
let lastHtml='', lastTab=null;
const sendingTargets=new Set(), tabScroll=new Map();
function theme(value) {
 const t=value?.context?.theme;
 if(t){for(const [key,variable] of Object.entries({background:'bg',surface:'surface',surfaceVariant:'soft',onSurface:'text',onSurfaceVariant:'muted',primary:'accent',onPrimary:'on-accent',outlineVariant:'line',error:'error',primaryContainer:'accent-soft',onPrimaryContainer:'on-soft',surfaceContainerLow:'surface-low'}))if(/^#[\da-f]{6,8}$/i.test(t[key]||''))document.documentElement.style.setProperty('--'+variable,t[key]);document.documentElement.style.colorScheme=t.dark?'dark':'light';document.documentElement.dataset.theme=t.dark?'dark':'light';}
 document.documentElement.style.setProperty('--font-scale',String(value?.context?.fontScale||1));
}
function toast(text){
 const el=document.getElementById('toast');clearTimeout(timer);clearTimeout(toastHide);
 el.textContent=text;el.hidden=false;
 requestAnimationFrame(()=>el.classList.add('show'));
 timer=setTimeout(()=>{el.classList.remove('show');toastHide=setTimeout(()=>el.hidden=true,240);},3500);
}
const sheets=createSheets({app,icon,cancel(){cancelBinding?.();cancelBinding=null;}});
const sheet=sheets.open,closeSheet=sheets.close;
function switchTab(next){
 if(next===tab)return;
 tabScroll.set(tab,window.scrollY);tab=next;render();
 window.scrollTo(0,tabScroll.get(tab)||0);
 if(tab==='history')loadHistory();
}
const when = value => new Intl.DateTimeFormat('zh-CN',{timeZone:state?.context?.timeZone||'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
function recordStatus(row){
 if(row.cancelled)return ['已停止',''];
 const sent=row.receipts.filter(x=>x.status==='sent').length;
 if(row.receipts.some(x=>x.status==='unknown'))return ['需核对','warn'];
 if(row.receipts.some(x=>x.status==='failed'))return [row.attempts>=6?'需手动重试':'等待重试','warn'];
 if(row.notification.expiresAt<=Date.now()&&sent<row.targetIds.length)return ['已过期',''];
 if(row.receipts.some(x=>x.status==='querying'))return ['正在查询',''];
 if(row.receipts.some(x=>x.status==='queued'))return ['等待平台结果',''];
 if(row.targetIds.every(id=>row.receipts.some(x=>x.targetId===id&&['sent','accepted','skipped'].includes(x.status))))return [row.receipts.some(x=>x.status==='accepted')?'平台已接收':sent?'已发送':'已跳过',sent||row.receipts.some(x=>x.status==='accepted')?'ok':''];
 return ['待发送',''];
}
function attention(){return history.filter(row=>recordStatus(row)[1]==='warn').length;}
function render(){
 const enabled=config.targets.filter(x=>x.enabled).length,paused=config.targets.length-enabled,warn=attention();
 const emptyTargets=`<div class="empty">${icon('bell')}<strong>把提醒送到你常用的平台</strong><p>可以绑定多个群或帐号，每个目标单独选择通知范围。</p></div>`;
 const emptyHistory=`<div class="empty">${icon('send')}<strong>还没有发送记录</strong><p>绑定后可以先发送测试消息。课简产生的新通知会显示在这里。</p></div>`;
 const body=tab==='targets' ? config.targets.length?config.targets.map(targetCard).join(''):emptyTargets : history.length?history.map(historyCard).join(''):emptyHistory;
 const summary=!config.targets.length?'绑定你的第一个平台':enabled?`个目标已启用`:'目前没有启用的目标';
 const detail=!config.targets.length?'同一平台也能绑定多个群或帐号':`共 ${config.targets.length} 个目标${paused?` · ${paused} 个已暂停`:''}`;
 const html=`<div class="page"><header class="top"><span class="logo">${icon('send')}</span><span class="title-copy"><h1>多平台通知</h1><p>你的课程和待办，送到常用的平台</p></span><button class="icon" id="help" aria-label="接入指南">${icon("help")}</button><button class="icon bordered" id="about" aria-label="关于组件">${icon("info")}</button></header><section class="overview"><span class="total">${enabled}</span><span class="overview-copy"><strong>${summary}</strong><p>${detail}</p></span></section>${warn?`<button class="alert-row" id="show-warn">${icon('alert')}<span class="grow">有 ${warn} 条发送记录需要处理</span><span>查看</span></button>`:''}<button class="primary add" id="add" ${!loaded||busy?'disabled':''}>${icon('plus')}添加通知目标</button><div class="tab-row"><nav class="segs" role="tablist" aria-label="通知页面"><span class="seg-thumb" aria-hidden="true"></span><button role="tab" aria-selected="${tab==='targets'}" data-tab="targets" class="${tab==='targets'?'on':''}">绑定目标</button><button role="tab" aria-selected="${tab==='history'}" data-tab="history" class="${tab==='history'?'on':''}">发送记录${warn?`<i class="count">${warn}</i>`:''}</button></nav><button class="icon bordered${refreshing?' spin':''}" id="refresh" aria-label="刷新绑定与记录" ${refreshing?'disabled':''}>${icon('refresh')}</button></div>${error?`<p class="feedback" role="alert">${esc(error)}</p>`:''}<div id="content-pane" class="content-pane">${loaded?body:'<p class="loading">正在读取绑定…</p>'}</div><p class="footnote">已读或被忽略的组件内容不会继续排队推送。笔记待办在截止前 24 小时内提醒一次；上课提醒跟随课简的上课通知设置。</p></div>`;
 if(html===lastHtml)return;
 const scroll=window.scrollY,position=segmentPosition(app);
 const focused=app.contains(document.activeElement)?document.activeElement:null;
 const focusSelector=focused?.id?`#${CSS.escape(focused.id)}`:focused?.dataset.enable?`[data-enable="${CSS.escape(focused.dataset.enable)}"]`:null;
 const changedTab=lastTab!==null&&lastTab!==tab;
 app.innerHTML=html;lastHtml=html;lastTab=tab;bindSegments(app,position);
 if(changedTab)app.querySelector('#content-pane').classList.add('enter');
 if(focusSelector)app.querySelector(focusSelector)?.focus({preventScroll:true});
 window.scrollTo(0,scroll);
 app.querySelector('#add').onclick=()=>edit();app.querySelector('#help').onclick=guide;app.querySelector('#about').onclick=openAbout;app.querySelector('#refresh').onclick=load;
 app.querySelector('#show-warn')?.addEventListener('click',()=>switchTab('history'));
 app.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
 app.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(config.targets.find(x=>x.id===b.dataset.edit)));
 app.querySelectorAll('[data-enable]').forEach(b=>b.onchange=async()=>{const next=clone(config);next.targets.find(x=>x.id===b.dataset.enable).enabled=b.checked;await save(next);});
 app.querySelectorAll('[data-test]').forEach(b=>b.onclick=()=>test(b.dataset.test));
 app.querySelectorAll('[data-retry]').forEach(b=>b.onclick=()=>retry(b.dataset.retry));
}
function lastResult(id){
 const rows=history.filter(row=>row.targetIds.includes(id)).sort((a,b)=>b.notification.createdAt-a.notification.createdAt);
 const row=rows[0];if(!row)return '<p class="last none">还没有发送过通知</p>';
 const status=row.receipts.find(x=>x.targetId===id)?.status,tone=['failed','unknown'].includes(status)?'warn':['sent','accepted'].includes(status)?'ok':'';
 return `<p class="last ${tone}"><i class="dot" aria-hidden="true"></i>最近：${resultText[status]||'待发送'} · ${when(row.notification.createdAt)}</p>`;
}
function targetCard(t){const p=platforms[t.platform];let host='';try{host=new URL(t.url).hostname;}catch{}const sub=[p.name,host].filter(Boolean).join(' · ');return `<section class="target${t.enabled?'':' paused'}"><div class="target-top">${markTile(t.platform)}<span class="target-info"><h2>${esc(t.name)}</h2><small>${esc(sub)}</small></span><label class="switch"><input type="checkbox" role="switch" data-enable="${esc(t.id)}" aria-label="启用 ${esc(t.name)}" ${t.enabled?'checked':''} ${busy?'disabled':''}></label></div><div class="range">${t.kinds.map(x=>`<span>${esc(kinds[x])}</span>`).join('')}</div>${lastResult(t.id)}<div class="actions"><button class="secondary" data-edit="${esc(t.id)}">编辑绑定</button><button class="secondary accent" data-test="${esc(t.id)}" ${sendingTargets.has(t.id)||busy?'disabled':''}>${sendingTargets.has(t.id)?'正在发送…':'发送测试'}</button></div></section>`;}
function historyCard(row){const event=row.notification,[label,tone]=recordStatus(row);const lines=row.targetIds.map(id=>{const receipt=row.receipts.find(x=>x.targetId===id);const name=config.targets.find(x=>x.id===id)?.name||'已移除目标';return `<div class="receipt"><span>${esc(name)}</span><span class="result">${resultText[receipt?.status]||'待发送'}</span></div>${receipt?.error?`<p class="${['failed','unknown'].includes(receipt.status)?'receipt-error':'receipt-note'}">${esc(receipt.error)}</p>`:''}`;}).join('');const retryable=!row.cancelled&&event.expiresAt>Date.now()&&row.receipts.some(x=>['failed','unknown','queued','querying'].includes(x.status));return `<section class="record"><div class="record-head"><strong>${esc(event.title)}</strong><span class="status ${tone}">${label}</span></div><small>${esc(event.sourceName)} · ${when(event.createdAt)}</small>${lines}${retryable?`<div class="actions"><button class="secondary accent" data-retry="${esc(event.id)}">${row.receipts.some(x=>x.status==='unknown')?'核对后重试':row.receipts.some(x=>['queued','querying'].includes(x.status))?'立即查询':'立即重试'}</button></div>`:''}</section>`;}
async function load(){
 if(refreshing)return;refreshing=true;error='';render();
 try{const saved=await sdk.request('notification.config.get');config=validateConfiguration(saved.values?.targets?saved.values:{targets:[]});loaded=true;await loadHistory();}
 catch(e){loaded=true;error=e.message;}
 finally{refreshing=false;render();}
}
async function loadHistory(){
 if(historyRequest)return historyRequest;
 historyRequest=(async()=>{try{history=await sdk.request('notification.history');render();}catch(e){error=e.message;render();}})();
 try{await historyRequest;}finally{historyRequest=null;}
}
async function save(next){
 if(busy)return false;
 const previous=config;
 let validated;try{validated=validateConfiguration(next);}catch(e){error=e.message;toast(e.message);render();return false;}
 busy=true;error='';config=validated;render();
 try{await sdk.request('notification.config.save',configurationEnvelope(validated));toast('绑定已保存');return true;}
 catch(e){config=previous;error=e.message;toast(e.message);return false;}
 finally{busy=false;render();}
}
async function test(id){
 if(sendingTargets.has(id)||busy)return;
 sendingTargets.add(id);render();
 try{const receipt=await sdk.request('notification.test',{targetId:id});toast(receipt.status==='queued'?'服务已接收，正在等待平台结果':receipt.status==='accepted'?'平台已接收请求，请在接收端核对':'平台已确认发送，请在目标平台查看测试消息');}
 catch(e){toast(e.message);}
 finally{sendingTargets.delete(id);await loadHistory();render();}
}
async function retry(id){const row=history.find(x=>x.notification.id===id);const run=async()=>{try{await sdk.request('notification.retry',{id});toast(row.receipts.some(x=>['queued','querying'].includes(x.status))?'已安排结果查询，已提交的消息不会重复发送':'已安排重试，已成功的目标不会重复发送');await loadHistory();}catch(e){toast(e.message);}};if(row.receipts.some(x=>x.status==='unknown'))sheet('确认重新发送？','<p>平台可能已经收到这条消息。请先核对目标平台，再重试未确认的目标。</p><div class="save-row"><button class="secondary" id="cancel">取消</button><button class="primary" id="confirm">确认重试</button></div>',root=>{root.querySelector('#cancel').onclick=closeSheet;root.querySelector('#confirm').onclick=()=>{closeSheet();run();};});else await run();}
const selects=new Map();
function selectField(id,label,value,options,onPick){selects.set(id,onPick);const current=options.find(o=>o.value===value)||options[0];return `<div class="field select-field" data-select="${id}"><span id="${id}-label">${esc(label)}</span><input type="hidden" id="${id}" value="${esc(current.value)}"><button type="button" class="select" id="${id}-trigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${id}-label ${id}-trigger"><span>${esc(current.label)}</span>${icon('chevron')}</button><div class="select-menu" role="listbox" hidden>${options.map(o=>`<button type="button" role="option" aria-selected="${o.value===current.value}" data-pick="${esc(o.value)}" class="${o.value===current.value?'on':''}"><span class="grow">${esc(o.label)}</span>${o.value===current.value?icon('check'):''}</button>`).join('')}</div></div>`;}
function bindSelects(root){root.querySelectorAll('[data-select]').forEach(box=>{const id=box.dataset.select,trigger=box.querySelector('.select'),menu=box.querySelector('.select-menu'),input=box.querySelector('input');trigger.onclick=()=>{const open=trigger.getAttribute('aria-expanded')==='true';trigger.setAttribute('aria-expanded',String(!open));menu.hidden=open;if(!open)menu.scrollIntoView({block:'center',behavior:'smooth'});};menu.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{input.value=b.dataset.pick;trigger.firstElementChild.textContent=b.querySelector('.grow').textContent;menu.querySelectorAll('[data-pick]').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-selected',String(on));x.querySelector('svg')?.remove();if(on)x.insertAdjacentHTML('beforeend',icon('check'));});trigger.setAttribute('aria-expanded','false');menu.hidden=true;selects.get(id)?.(b.dataset.pick);});});}
function field(id,label,value,placeholder='',password=false,hint=''){return `<label class="field"><span>${label}</span><input id="${id}" type="${password?'password':'text'}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">${hint?`<small>${esc(hint)}</small>`:''}</label>`;}
const bindingCtx={now:()=>Date.now(),network:{async fetch(url,options={}){const response=await sdk.request('notification.fetch',{url,...options});return {...response,json:async()=>JSON.parse(response.body)};}}};
let cancelBinding=null;
function showBindingError(root,e){const node=root.querySelector('#form-error');if(node&&root.isConnected){node.hidden=false;node.textContent=e.message;}}
async function connectWechat(root,draft,read){
 read();cancelBinding?.();let stopped=false;cancelBinding=()=>{stopped=true;};const alive=()=>!stopped&&root.isConnected;
 const button=root.querySelector('#wechat-connect'),area=root.querySelector('#wechat-progress');button.disabled=true;
 try{
  const login=await startWechatLogin(bindingCtx);if(!alive())return;
  const qr=window.qrcode(0,'M');qr.addData(login.content);qr.make();
  area.innerHTML=`<div class="qr-code">${qr.createSvgTag({cellSize:4,margin:4,scalable:true})}</div><p id="wechat-status">请用微信扫码并确认。也可以截图后在微信扫一扫中从相册选择。</p><div id="verify-box" hidden>${field('verify','手机微信显示的数字','','配对数字')}<button class="secondary" id="verify-submit">继续连接</button></div>`;
  let verify='',deadline=Date.now()+240000;
  while(alive()&&Date.now()<deadline){
   let value;try{value=await pollWechatLogin(bindingCtx,login,verify);}catch(e){if(e.network){await new Promise(r=>setTimeout(r,1000));continue;}throw e;}
   if(!alive())return;
   if(value.status==='scaned_but_redirect'){login.base=value.base;continue;}
   if(value.status==='need_verifycode'){
    root.querySelector('#verify-box').hidden=false;root.querySelector('#wechat-status').textContent='请填写微信手机上显示的配对数字。';
    verify=await new Promise(resolve=>{root.querySelector('#verify-submit').onclick=()=>{const text=root.querySelector('#verify').value.trim();if(/^\d{4,12}$/.test(text)){root.querySelector('#verify-box').hidden=true;resolve(text);}else root.querySelector('#wechat-status').textContent='请输入手机微信显示的数字。';};});continue;
   }
   if(value.status==='expired'||value.status==='verify_code_blocked')throw new Error('二维码已过期或配对被限制，请重新连接');
   if(value.status==='binded_redirect')throw new Error('此微信已经连接过，请编辑已有绑定或重新获取二维码');
   if(value.status==='scaned'){verify='';root.querySelector('#wechat-status').textContent='已扫码，请在微信中确认连接。';}
   if(value.status==='confirmed'){
    Object.assign(draft,{url:value.base,botToken:value.bot_token,botId:value.ilink_bot_id,recipient:value.ilink_user_id,contextToken:'',cursor:''});
    area.querySelector('.qr-code').hidden=true;root.querySelector('#wechat-status').textContent='已确认连接。请在微信里向刚连接的机器人发送一条消息，以绑定通知会话。';
    let session={},bindDeadline=Date.now()+120000;
    while(alive()&&Date.now()<bindDeadline){session=await pullWechatSession(bindingCtx,draft,session,4000);if(!alive())return;if(session.contextToken){Object.assign(draft,session);area.innerHTML='<p class="hint">微信会话已绑定。保存后点「发送测试」，再到微信检查实际收到的消息。</p>';return;}await new Promise(r=>setTimeout(r,800));}
    throw new Error('尚未收到你的微信消息。请向连接的机器人发消息，再重新连接');
   }
   await new Promise(r=>setTimeout(r,1000));
  }
  if(alive())throw new Error('连接等待超时，请重新获取二维码');
 }catch(e){if(alive())showBindingError(root,e);}finally{if(alive())button.disabled=false;}
}
async function captureQQ(root,draft,read){
 read();cancelBinding?.();let socket,heartbeat,timer,stopped=false;const stop=()=>{stopped=true;clearInterval(heartbeat);clearTimeout(timer);socket?.close();};cancelBinding=stop;
 const button=root.querySelector('#qq-capture'),area=root.querySelector('#qq-progress');button.disabled=true;
 try{
  if(!/^[0-9]{5,24}$/.test(draft.appId||'')||!draft.appSecret)throw new Error('请先填写 QQ 机器人的 AppID 和 AppSecret');
  const session=await qqAccessToken(bindingCtx,draft);if(stopped||!root.isConnected)return;
  const gateway=await channelRequest(bindingCtx,'https://api.sgroup.qq.com/gateway',{headers:{Authorization:'QQBot '+session.accessToken}});
  const url=new URL(gateway.url);if(url.protocol!=='wss:'||!['api.sgroup.qq.com','bot.q.qq.com'].includes(url.hostname))throw new Error('QQ 返回的连接地址尚不支持，请手动填写官方事件中的 OpenID');
  if(stopped||!root.isConnected)return;
  const code='课简绑定'+String(crypto.getRandomValues(new Uint32Array(1))[0]).slice(-6).padStart(6,'0');
  area.textContent='正在连接 QQ 机器人…';
  await new Promise((resolve,reject)=>{
   socket=new WebSocket(url.href);let sequence=null;
   timer=setTimeout(()=>reject(new Error('没有收到绑定消息，请确认机器人已启用并重试')),120000);
   socket.onerror=()=>reject(new Error('QQ 机器人连接失败，请核对平台权限或手动填写 OpenID'));
   socket.onclose=()=>{if(!stopped)reject(new Error('QQ 连接已关闭，请重试获取收件人'));};
   socket.onmessage=event=>{try{
    const value=JSON.parse(event.data);if(value.s!=null)sequence=value.s;
    if(value.op===10){socket.send(JSON.stringify({op:2,d:{token:'QQBot '+session.accessToken,intents:1<<25,shard:[0,1]}}));heartbeat=setInterval(()=>{if(socket.readyState===1)socket.send(JSON.stringify({op:1,d:sequence}));},Math.max(1000,value.d.heartbeat_interval));}
    if(value.op===0&&value.t==='READY')area.textContent=draft.targetType==='group'?`请在目标群 @ 此机器人并发送「${code}」。`:`请私聊此机器人并发送「${code}」。`;
    if(value.op===9||value.op===7)reject(new Error('QQ 拒绝连接，请检查机器人配置与事件权限'));
    if(value.op===0&&value.d?.content?.includes(code)){
     const recipient=draft.targetType==='group'&&value.t==='GROUP_AT_MESSAGE_CREATE'?value.d.group_openid:draft.targetType==='c2c'&&value.t==='C2C_MESSAGE_CREATE'?value.d.author?.user_openid:null;
     if(recipient){draft.recipient=recipient;root.querySelector('#recipient').value=recipient;area.textContent='已获取此机器人对应的收件人。保存绑定后发送测试。';resolve();}
    }
   }catch{reject(new Error('QQ 返回的数据无法识别'));}};
  });
 }catch(e){if(!stopped&&root.isConnected)showBindingError(root,e);}finally{stop();if(root.isConnected)button.disabled=false;}
}

function edit(original){const draft=original?clone(original):{id:crypto.randomUUID().replaceAll('-','_'),platform:'feishu',mode:'direct',name:'',url:'',secret:'',token:'',routeId:'',enabled:true,kinds:Object.keys(kinds),includeBody:true};let readCurrent=()=>{};const draw=()=>{const p={...platforms[draft.platform],relay:draft.platform==='openclaw'||draft.mode==='relay'||Boolean(draft.routeId)};const direct=p.direct&&!p.relay;sheet(original?'编辑通知目标':'添加通知目标',`<div class="field"><span id="platform-label">平台</span><button type="button" id="platform" class="platform-picker" aria-labelledby="platform-label" aria-haspopup="listbox" aria-expanded="false">${markTile(draft.platform,'platform mini')}<span class="grow">${esc(p.name)}</span>${icon('chevron')}</button><div class="platform-menu" id="platform-menu" hidden>${platformMenu(draft)}</div><small>${esc(p.hint)}</small></div>${p.doc?'<button type="button" class="secondary provider-doc" id="provider-doc">打开平台配置 / 获取密钥</button>':''}${field('name','目标名称',draft.name,'例如：我的微信 / 学习群')}<p class="section-title">接入信息</p>${p.direct?selectField('channel-mode','接入方式',p.relay?'relay':'direct',[{value:'direct',label:'直接连接平台'},{value:'relay',label:'已有 OpenClaw 桥接'}],value=>{readCurrent();draft.mode=value;draft.routeId='';draft.url=draft.platform==='wechat'?WECHAT_BASE:'';draw();}):''}${p.smtp?`${field('mailFrom','发件'+p.smtp.name,draft.mailFrom,'你的邮箱@'+p.smtp.domain)}${field('mailAuthCode','SMTP 授权码',draft.mailAuthCode,p.smtp.name+'生成的授权码',true,'开启 SMTP 后生成，不能使用邮箱登录密码。')}${field('mailTo','收件邮箱',draft.mailTo||draft.mailFrom,'接收通知的邮箱，可与发件邮箱相同')}<p class=hint>服务器 ${esc(p.smtp.host)} · TLS 465。保存后发送测试，再检查收件箱或垃圾邮件。</p>`:p.push?`${field('push-token',p.tokenLabel,draft.token,p.tokenHint,true)}${draft.platform==='wxpusher'?field('push-uid','接收用户 UID',draft.uid,'UID_…',false,'此用户需要先订阅对应应用。'):''}${draft.platform==='pushplus'?`${field('push-topic','群组编码（可选）',draft.topic,'留空发给自己')}${field('query-secret','结果查询密钥（可选）',draft.querySecret,'平台开发设置中的 secretKey',true,'查询需使用用户 Token，并在平台开启开放接口、配置安全 IP。未配置时仅显示平台已接收。')}`:''}${p.endpoint?field('url','服务地址',draft.url||p.endpoint,p.endpoint,false,'官方地址可直接使用，也可填写自建 HTTPS 接口。'):''}`:direct?draft.platform==='qq'?`${field('appId','QQ 机器人 AppID',draft.appId,'QQ 开放平台的 AppID')}${field('appSecret','QQ 机器人 AppSecret',draft.appSecret,'仅加密保存在手机',true)}${selectField('targetType','接收位置',draft.targetType==='group'?'group':'c2c',[{value:'c2c',label:'QQ 私聊'},{value:'group',label:'QQ 群'}],()=>{})}${field('recipient','收件人 OpenID',draft.recipient,'可点下方按钮自动获取',false,'普通 QQ 号或群号不能填在这里。')}<button class="secondary accent" id="qq-capture">获取收件人</button><p id="qq-progress" class="hint"></p>`:`<button class="secondary accent" id="wechat-connect">${draft.botToken?'重新扫码连接微信':'扫码连接微信'}</button><div id="wechat-progress" class="binding-progress">${draft.contextToken?'<p class="hint">此微信会话已绑定，可保存后发送测试。</p>':''}</div>`:field('url',p.relay?'桥接服务地址':'Webhook 地址',draft.url,p.relay?'https://notify.example.com/v1/notify':p.url||'https://example.com/notify',!p.relay)}${p.sign?field('secret','签名密钥（可选）',draft.secret,'平台开启签名校验时填写',true):''}${p.keyword?field('keyword','自定义关键词（可选）',draft.keyword,'平台要求的关键词会加在消息开头'):''}${p.relay||p.token?field('token',p.relay?'桥接访问令牌':'访问令牌（可选）',draft.token,'',true):''}${p.relay?field('route','路由 ID',draft.routeId,draft.platform==='qq'?'qq-private':'wechat-private','', '与桥接服务配置中的 id 相同；收件人由服务端绑定'):''}<p class="section-title">推送哪些通知</p><div class="checklist">${Object.entries(kinds).map(([id,label])=>`<label><input type="checkbox" data-kind="${id}" ${draft.kinds.includes(id)?'checked':''}><span class="grow"><b>${label}</b><small>${kindHints[id]}</small></span></label>`).join('')}</div><div class="checklist"><label><input type="checkbox" id="body" ${draft.includeBody?'checked':''}><span class="grow"><b>推送通知正文摘要</b><small>关闭后只推送标题，不含正文内容</small></span></label></div><p id="form-error" class="feedback" role="alert" hidden></p><div class="save-row">${original?'<button class="secondary danger" id="remove">移除绑定</button>':''}<button class="primary" id="save">保存绑定</button></div>`,root=>{
 root.querySelector('#provider-doc')?.addEventListener('click',()=>sdk.request('ui.openExternal',{url:p.doc}).catch(e=>toast(e.message)));
 const read=()=>{for(const [field,key] of Object.entries({name:'name',url:'url',secret:'secret',keyword:'keyword',token:'token',route:'routeId',appId:'appId',appSecret:'appSecret',recipient:'recipient',mailFrom:'mailFrom',mailAuthCode:'mailAuthCode',mailTo:'mailTo','push-token':'token','push-uid':'uid','push-topic':'topic','query-secret':'querySecret'})){const input=root.querySelector('#'+field);if(input)draft[key]=input.value.trim();}draft.kinds=[...root.querySelectorAll('[data-kind]:checked')].map(x=>x.dataset.kind);draft.includeBody=root.querySelector('#body').checked;if(root.querySelector('#targetType'))draft.targetType=root.querySelector('#targetType').value;};
 readCurrent=read;bindSelects(root);
 root.querySelector('#wechat-connect')?.addEventListener('click',()=>connectWechat(root,draft,read));
 root.querySelector('#qq-capture')?.addEventListener('click',()=>captureQQ(root,draft,read));
 root.querySelector('#platform').onclick=()=>{const menu=root.querySelector('#platform-menu');menu.hidden=!menu.hidden;root.querySelector('#platform').setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden){root.querySelector('#platform-search').focus({preventScroll:true});menu.scrollIntoView({block:'start',behavior:'smooth'});}};
 root.querySelector('#platform-search').addEventListener('input',event=>{const query=event.target.value.trim().toLowerCase();root.querySelectorAll('[data-platform]').forEach(b=>{b.hidden=!b.dataset.search.includes(query);});root.querySelectorAll('[data-platform-group]').forEach(g=>{g.hidden=![...g.querySelectorAll('[data-platform]')].some(b=>!b.hidden);});root.querySelector('#platform-empty').hidden=[...root.querySelectorAll('[data-platform]')].some(b=>!b.hidden);});
 root.querySelectorAll('[data-platform]').forEach(button=>button.onclick=()=>{read();draft.platform=button.dataset.platform;draft.url='';draft.secret='';draft.token='';draft.routeId='';draft.mode='direct';draft.targetType='c2c';draft.recipient='';draft.botToken='';draft.botId='';draft.contextToken='';draft.appId='';draft.appSecret='';draft.mailFrom='';draft.mailAuthCode='';draft.mailTo='';draft.uid='';draft.topic='';draft.querySecret='';draw();});
 root.querySelector('#save').onclick=async()=>{read();try{validateConfiguration({targets:[draft]});const next={targets:[...config.targets.filter(x=>x.id!==draft.id),draft]};if(await save(next))closeSheet();}catch(e){const el=root.querySelector('#form-error');el.textContent=e.message;el.hidden=false;}};
 root.querySelector('#remove')?.addEventListener('click',async()=>{if(await save({targets:config.targets.filter(x=>x.id!==draft.id)}))closeSheet();});
 });};draw();}
function guide(){sheet('接入指南',`<div class="guide"><details class="guide-item" open><summary>飞书、企业微信、钉钉${icon('chevron')}</summary><div class="guide-body"><p>在目标群内创建机器人或消息推送，复制 Webhook 到绑定页面。开启签名或关键词时，填写对应配置。</p></div></details><details class="guide-item"><summary>个人微信${icon('chevron')}</summary><div class="guide-body"><p>选择个人微信后点击「扫码连接微信」，用微信扫码并确认。需要配对数字时在此填写。连接后向机器人发一条消息，组件会绑定你的私信会话，再保存并发送测试。可以截图后从微信扫一扫的相册中选择二维码。微信渠道使用腾讯微信机器人接口，当前支持私信，无法向任意微信联系人或群发送。</p></div></details><details class="guide-item"><summary>更多国内推送服务${icon('chevron')}</summary><div class="guide-body"><p>Server酱填写 SendKey，兼容 SCT 和 sctp；先在平台配置接收通道。PushPlus 填推送 Token，群组需订阅；可选查询密钥需在平台开启开放接口和安全 IP。WxPusher 填应用 AppToken 与已订阅用户 UID。PushDeer 填接收设备的 PushKey，Bark 填 iPhone / iPad 的设备 Key；两者支持自建 HTTPS 服务。</p><p>接口只确认接收或创建任务时，记录显示「平台已接收」。PushPlus 开启查询后，排队显示「等待平台结果」，后台核对后才显示已发送。</p></div></details><details class="guide-item"><summary>QQ / 网易邮箱${icon('chevron')}</summary><div class="guide-body"><p>在对应邮箱设置中开启 SMTP 服务并生成授权码。选择对应邮箱，填写发件邮箱、授权码和收件邮箱。可以发给自己，也可以发给其他邮箱；保存后发送测试，检查收件箱或垃圾邮件。授权码不是 QQ 登录密码。</p><button class=secondary data-doc="https://service.mail.qq.com/">QQ 邮箱帮助中心</button></div></details><details class="guide-item"><summary>QQ 机器人${icon('chevron')}</summary><div class="guide-body"><p>在 QQ 开放平台创建并启用官方机器人，填入 AppID 和 AppSecret。点「获取收件人」，按提示私聊机器人或在群里 @ 机器人发送随机绑定口令；也可以填写该机器人官方消息事件中的 OpenID。机器人主动消息可能受配额和近期互动条件限制，平台拒绝时发送记录会显示失败。</p><button class="secondary" data-doc="https://bot.q.qq.com/">QQ 开放平台</button></div></details><details class="guide-item"><summary>保存与测试${icon('chevron')}</summary><div class="guide-body"><p>绑定和会话令牌加密保存在手机，不需要运行 OpenClaw。保存后点「发送测试」，成功回执只说明平台接受请求，请在对应平台核对实际消息。手机需要联网并允许课简后台运行。</p></div></details><details class="guide-item"><summary>已有 OpenClaw 的用户${icon('chevron')}</summary><div class="guide-body"><p>仍可在 QQ 或微信的「接入方式」中选择已有桥接，填写服务地址、令牌和路由 ID。</p></div></details></div>`,root=>root.querySelectorAll('[data-doc]').forEach(b=>b.onclick=()=>sdk.request('ui.openExternal',{url:b.dataset.doc}).catch(e=>toast(e.message))));}
function openAbout(){
 const m=state.manifest,repo=m.homepage||'';
 sheet('关于组件',`<div class="group"><div class="row"><span class="platform">通</span><span class="row-copy"><strong>${esc(m.name||'组件')}</strong><small>${esc(m.publisher||'')} · 多平台通知</small></span></div><button class="nav-row" id="about-version"><span class="row-copy"><span>版本</span><small>v${esc(m.version||'-')}</small></span>${icon('chevron')}</button>${repo?`<button class="nav-row" id="about-repo"><span class="row-copy"><span>开源仓库</span><small>${esc(repo)}</small></span>${icon('help')}</button>`:''}</div>`,root=>{
  root.querySelector('#about-repo')?.addEventListener('click',()=>sdk.request('ui.openExternal',{url:repo}));
  let taps=0,last=0;root.querySelector('#about-version')?.addEventListener('click',()=>{const nowMs=Date.now();if(nowMs-last>3000)taps=0;last=nowMs;if(++taps>=7){taps=0;openHiddenTools();}});
 });
}

function openHiddenTools(){
 sheet('诊断工具',`<div class="group"><div class="row"><span class="row-copy"><strong>多平台通知诊断</strong><small>测试发送内容、查看平台回执和组件日志</small></span></div><button class="nav-row" id="diag-test"><span class="row-copy"><span>发送测试内容</span><small>使用第一个已启用目标发送一条固定测试消息</small></span>${icon('send')}</button><button class="nav-row" id="diag-refresh"><span class="row-copy"><span>刷新通知记录</span><small>重新读取目标和最近回执</small></span>${icon('refresh')}</button><button class="nav-row" id="diag-logs"><span class="row-copy"><span>查看调试日志</span><small>显示最近的组件运行日志</small></span>${icon('help')}</button><button class="nav-row danger" id="diag-disable"><span class="row-copy"><span>关闭隐藏工具</span><small>关闭隐藏入口</small></span>${icon('close')}</button></div><pre id="diag-log-output" hidden></pre>`,root=>{
  root.querySelector('#diag-test').onclick=async()=>{const target=config.targets.find(x=>x.enabled);if(!target){toast('请先配置并启用一个通知目标');return;}try{const result=await sdk.request('notification.test',{targetId:target.id});toast('测试消息：'+(result.status||'已提交'));await loadHistory();}catch(e){toast(e.message);}};
  root.querySelector('#diag-refresh').onclick=()=>load().then(()=>toast('已刷新'));
  root.querySelector('#diag-logs').onclick=async()=>{const out=root.querySelector('#diag-log-output');out.hidden=false;out.textContent='读取中…';try{const rows=await sdk.request('debug.logs');out.textContent=(rows||[]).map(x=>`${new Date(x.time).toLocaleTimeString()} [${x.level}] ${x.event} ${x.message||''}`).join('\\\\n')||'暂无组件日志';}catch(e){out.textContent=e.message;}};
  root.querySelector('#diag-disable').onclick=()=>sdk.request('debug.advancedTools',{enabled:false}).then(()=>{toast('已关闭隐藏工具');document.querySelector('#sheet-close')?.click();});
 });
}

let widgetAboutOpened=false;
if(!sdk){app.innerHTML='<p class="loading">请在支持 API 9 的课简中打开此组件。</p>';}else{sdk.subscribe(value=>{state=value;theme(value);render();if(value.context?.widgetAbout&&!widgetAboutOpened){widgetAboutOpened=true;setTimeout(openAbout,0);}});load();}

setInterval(()=>{if(tab==='history'&&loaded&&!document.hidden)loadHistory();},5000);
