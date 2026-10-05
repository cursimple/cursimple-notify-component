import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBridge,validateBridgeConfig,openclawArguments} from '../bridge/server.mjs';

const token='fixture-access-token-0123456789';
const route={id:'qq-private',channel:'qqbot',target:'qqbot:c2c:fixed_openid',account:'bot-two'};
const config=validateBridgeConfig({routes:[route]}, {CURSIMPLE_NOTIFY_BRIDGE_TOKEN:token});
const event=()=>({id:'message-1',kind:'class',title:'Class',body:'Room A',sourceName:'Schedule',expiresAt:Date.now()+60000});
async function fixture(send){const dir=await mkdtemp(join(tmpdir(),'notify-bridge-'));const server=await createBridge(config,{stateFile:join(dir,'state.json'),send});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/v1/notify';return {url,async close(){await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}};}
async function post(f,input,auth=true){const r=await fetch(f.url,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)});return {status:r.status,body:await r.json()};}

test('桥接认证与固定收件人路由阻止匿名或任意目标请求',async()=>{let calls=0;const f=await fixture(async()=>{calls++;return{ok:true,delivered:true};});try{const notification=event();assert.equal((await post(f,{id:notification.id,routeId:route.id,notification},false)).status,401);assert.equal((await post(f,{id:notification.id,routeId:'unbound',notification})).status,404);assert.equal(calls,0);}finally{await f.close();}});
test('重复及并发请求只发送一次，成功回执可重放',async()=>{let calls=0;const f=await fixture(async()=>{calls++;await new Promise(r=>setTimeout(r,10));return{ok:true,delivered:true};});try{const notification=event(),input={id:notification.id,routeId:route.id,notification};const result=await Promise.all([post(f,input),post(f,input)]);assert.ok(result.every(r=>r.body.delivered));assert.equal(calls,1);assert.equal((await post(f,input)).body.deduplicated,true);assert.equal(calls,1);}finally{await f.close();}});
test('未知结果阻止自动重复，用户明确强制重试时才再次发送',async()=>{let calls=0;const f=await fixture(async()=>{calls++;return calls===1?{ok:false,unknown:true,error:'Unknown'}:{ok:true,delivered:true};});try{const notification=event(),input={id:notification.id,routeId:route.id,notification};assert.equal((await post(f,input)).status,202);assert.equal((await post(f,input)).status,202);assert.equal(calls,1);assert.equal((await post(f,{...input,force:true})).body.delivered,true);assert.equal(calls,2);}finally{await f.close();}});
test('CLI 参数为无 shell 的独立参数，消息里的引号和命令字符只属于正文',()=>{const args=openclawArguments(route,{title:'$(do-not-run)',body:'`quoted` ; text',sourceName:'Notes'});assert.equal(args[args.indexOf('--target')+1],route.target);assert.ok(args[args.indexOf('--message')+1].includes('$(do-not-run)'));assert.equal(args[args.indexOf('--account')+1],'bot-two');assert.ok(args.includes('--json'));});
test('过期消息不发送，坏配置不回退到默认收件人',async()=>{const f=await fixture(async()=>{throw new Error('must not send');});try{const notification={...event(),expiresAt:Date.now()-1};assert.equal((await post(f,{id:notification.id,routeId:route.id,notification})).status,410);assert.throws(()=>validateBridgeConfig({routes:[{...route,target:'--anything'}]}, {CURSIMPLE_NOTIFY_BRIDGE_TOKEN:token}));assert.throws(()=>validateBridgeConfig({routes:[route]}, {CURSIMPLE_NOTIFY_BRIDGE_TOKEN:'short'}));}finally{await f.close();}});

test('实际 CLI JSON 必须包含对应渠道的 send 回执，空结果和取消不能冒充成功',async()=>{
 const {runOpenClaw}=await import('../bridge/server.mjs');
 const success={action:'send',channel:'qqbot',dryRun:false,payload:{result:{messageId:'fixture-message-id'},deliveryStatus:'sent'}};
 const cases=[success,{}, {action:'send',channel:'qqbot',dryRun:false,payload:{}},{...success,dryRun:true},{...success,channel:'other'},{...success,payload:{...success.payload,deliveryStatus:'suppressed'}},{...success,payload:{...success.payload,meta:{error:'rejected'}}}];
 for(const [index,output]of cases.entries()){
  const script='process.stdout.write('+JSON.stringify(JSON.stringify(output))+')';
  const result=await runOpenClaw(process.execPath,['-e',script,'--','--channel','qqbot'],3000);
  assert.equal(result.ok,index===0);
 }
});
