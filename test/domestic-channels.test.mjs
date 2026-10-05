import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validateConfiguration,configurationEnvelope,deliverNotifications,sendToTarget,serverchanUrl,MAIL_PROFILES} from '../plugin-packages/multi-platform-notify/main.js';
const now=Date.now();
const event={id:'fixture/domestic-1',kind:'class',title:'课程🙂'.repeat(25),body:'08:00 A101',sourceName:'课表',expiresAt:now+60000};
const base=(platform,extra={})=>validateConfiguration({targets:[{id:'target_one',name:'Fixture',platform,enabled:true,kinds:['class'],token:'fixture-token',...extra}]}).targets[0];
function fixture(target,handler,sessions={}){
 const calls=[],acks=[],saved=[];
 const ctx={calls,acks,saved,now:()=>now,secureConfiguration:{targets:[target]},secureSessions:sessions,
 notifications:[{notification:event,targetIds:[target.id],receipts:[]}],
 notification:{async receipt(...args){acks.push(args);return true;},async session(id,value){saved.push(value);return true;}},
 crypto:{async hmacSha256(key,text){return createHmac('sha256',key).update(text).digest('base64');}},
 network:{async fetch(url,init){const call={url,init,body:init.body?JSON.parse(init.body):null};calls.push(call);const value=await handler(call);if(value?.raw)return value.raw;return{ok:true,status:200,json:async()=>value};}}};return ctx;
}
test('Server酱 两类 SendKey 路由正确，非法密钥不能写入 URL',()=>{
 assert.equal(serverchanUrl('SCTfixture_1234'),'https://sctapi.ftqq.com/SCTfixture_1234.send');
 assert.equal(serverchanUrl('sctp123tfixture_1234'),'https://123.push.ft07.com/send/sctp123tfixture_1234.send');
 assert.throws(()=>serverchanUrl('sctpfoo/../secret'));
 const config=configurationEnvelope({targets:[base('serverchan',{token:'sctp123tfixture_1234'})]});
 assert.deepEqual(config.hosts,['123.push.ft07.com']);assert.equal(JSON.stringify(config.targets).includes('fixture_1234'),false);
});
test('Server酱 截短标题且接收回执不会伪装成发送确认',async()=>{
 const t=base('serverchan',{token:'SCTfixture_1234'}),ctx=fixture(t,()=>({code:0,data:{errno:0}}));
 const result=await deliverNotifications(ctx);assert.equal([...ctx.calls[0].body.title].length,32);
 assert.equal(ctx.calls[0].body.desp.includes(event.body),true);assert.equal(result.accepted,1);
 assert.equal(ctx.acks.some(r=>r[2]==='sent'),false);assert.ok(ctx.acks.some(r=>r[2]==='accepted'));
});
test('PushPlus 初次排队、后续查询只提交一次消息，确认后才标发送成功',async()=>{
 const t=base('pushplus',{querySecret:'query-secret-fixture-0123456789'});
 let posts=0,status=1;
 const handler=({url})=>url.endsWith('/send')?(posts++,{code:200,data:'provider-short-code'}):url.includes('getAccessKey')?{code:200,data:{accessKey:'query-access',expiresIn:7200}}:{code:200,data:{status}};
 const first=fixture(t,handler);assert.equal((await deliverNotifications(first)).queued,1);
 assert.ok(first.acks.some(r=>r[2]==='queued'));assert.equal(first.acks.some(r=>r[2]==='sent'),false);
 status=2;
 const second=fixture(t,handler,{[t.id]:first.saved.at(-1)});second.notifications[0].receipts=[{targetId:t.id,status:'queued'}];
 assert.equal((await deliverNotifications(second)).delivered,1);assert.equal(posts,1);
 assert.equal(second.acks[0][2],'querying');assert.ok(second.acks.some(r=>r[2]==='sent'));
 assert.equal(second.calls[0].init.headers['access-key'],'query-access');
});
test('PushPlus 只有发送 Token 时显示已接收，多个新通知不被旧跟踪记录阻塞',async()=>{
 const t=base('pushplus');let posts=0;
 const ctx=fixture(t,()=>{posts++;return{code:200,data:'reference-'+posts};});
 for(let i=0;i<20;i++){ctx.notifications[0].notification={...event,id:'fixture/'+i};assert.equal((await deliverNotifications(ctx)).accepted,1);}
 assert.equal(posts,20);assert.deepEqual(ctx.saved.at(-1).pending,{});assert.equal(ctx.acks.some(r=>r[2]==='sent'),false);
});
test('PushPlus 查询异常保留排队，失去跟踪记录也不会重新提交',async()=>{
 const t=base('pushplus',{querySecret:'query-secret-fixture-0123456789'});
 const saved={pending:{[event.id]:{phase:'queued',shortCode:'known-short-code',expiresAt:event.expiresAt}}};
 const ctx=fixture(t,()=>({code:403}),{[t.id]:saved});ctx.notifications[0].receipts=[{targetId:t.id,status:'queued'}];
 assert.equal((await deliverNotifications(ctx)).queued,1);assert.ok(ctx.calls.every(c=>!c.url.endsWith('/send')));
 const lost=fixture(t,()=>{throw new Error('must not resubmit');});lost.notifications[0].receipts=[{targetId:t.id,status:'queued'}];
 await deliverNotifications(lost);assert.equal(lost.calls.length,0);assert.ok(lost.acks.some(r=>r[2]==='unknown'));
});
test('PushPlus 明确发送失败后允许以后重试，其他非终态不会标成功',async()=>{
 const t=base('pushplus',{querySecret:'query-secret-fixture-0123456789'});
 for(const status of [0,3,99]){
  const ref={pending:{[event.id]:{phase:'queued',shortCode:'known-code',expiresAt:event.expiresAt}},accessKey:'cached',accessExpiresAt:now+60000};
  const ctx=fixture(t,()=>({code:200,data:{status}}),{[t.id]:ref});ctx.notifications[0].receipts=[{targetId:t.id,status:'queued'}];await deliverNotifications(ctx);
  assert.equal(ctx.acks.some(r=>r[2]==='sent'),false);assert.ok(ctx.acks.some(r=>r[2]===(status===3?'failed':'queued')));
 }
});
test('WxPusher 使用单用户订阅、校验每个接收者任务回执',async()=>{
 const t=base('wxpusher',{token:'AT_fixture123',uid:'UID_fixture123'});
 for(const data of [[{uid:t.uid,code:1000,sendRecordId:123}],[],[{uid:'UID_other123',code:1000,sendRecordId:124}],[{uid:t.uid,code:1001}]]){
  const ctx=fixture(t,()=>({code:1000,success:true,data}));await deliverNotifications(ctx);
  assert.deepEqual(ctx.calls[0].body.uids,[t.uid]);assert.equal(ctx.calls[0].body.contentType,1);
  assert.equal(ctx.acks.some(r=>r[2]==='accepted'),data[0]?.uid===t.uid&&data[0]?.code===1000);
  assert.equal(ctx.acks.some(r=>r[2]==='sent'),false);
 }
});
test('Bark 支持自建 HTTPS，设备 Key 只在正文，拒绝 HTTP 和空回执',async()=>{
 const t=base('bark',{url:'https://bark.example/push'}),ctx=fixture(t,()=>({code:200}));await sendToTarget(ctx,t,event);
 assert.equal(ctx.calls[0].url,t.url);assert.equal(ctx.calls[0].body.device_key,t.token);
 assert.throws(()=>base('bark',{url:'http://bark.example/push'}));
 const missing=fixture(t,()=>({}));await deliverNotifications(missing);assert.equal(missing.acks.some(r=>r[2]==='sent'),false);
});
test('PushDeer 校验设备结果，code=0 加空结果或部分拒绝不能标成功',async()=>{
 const t=base('pushdeer');
 for(const result of [[JSON.stringify({success:'ok',counts:1,logs:[]})],[],['not-json'],[JSON.stringify({success:'ok',counts:0})],[JSON.stringify({success:'ok',counts:1}),JSON.stringify({error:'failed'})],[JSON.stringify({success:'ok'})]]){
  const ctx=fixture(t,()=>({code:0,content:{result}}));await deliverNotifications(ctx);
  assert.equal(ctx.calls[0].body.pushkey,t.token);assert.equal(ctx.calls[0].body.type,'text');assert.ok(ctx.calls[0].body.text.includes(event.title)&&ctx.calls[0].body.text.includes(event.body),'PushDeer 文本消息的内容必须在 text 字段');assert.equal('desp' in ctx.calls[0].body,false);assert.equal(ctx.acks.some(r=>r[2]==='sent'),result.length===1&&result[0].includes('"counts":1'));
 }
});
test('网易 163／126 使用对应邮箱域名和服务器，授权码不进入公开目标摘要',async()=>{
 for(const platform of ['netease163','netease126']){
  const profile=MAIL_PROFILES[platform];const t=base(platform,{mailFrom:'user@'+profile.domain,mailTo:'receiver@example.com',mailAuthCode:'ABCDEFGHIJKLMNOP'});
  const ctx=fixture(t,()=>{throw new Error('must not use HTTP');});let payload;ctx.mail={async send(p){payload=p;return{ok:true,accepted:true};}};
  await sendToTarget(ctx,t,event);assert.equal(payload.host,profile.host);assert.equal(payload.port,465);
  assert.equal(JSON.stringify(configurationEnvelope({targets:[t]}).targets).includes('ABCDEFGHIJKLMNOP'),false);
  assert.throws(()=>base(platform,{mailFrom:'user@qq.com',mailTo:'receiver@example.com',mailAuthCode:'ABCDEFGHIJKLMNOP'}));
 }
});
