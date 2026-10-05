import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash,timingSafeEqual} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const messageText = event=>['课简 · '+(event.sourceName||'通知'),event.title,event.body].filter(Boolean).join('\n');

export function validateBridgeConfig(input,env=process.env) {
  const token=env[input.tokenEnv||'CURSIMPLE_NOTIFY_BRIDGE_TOKEN'];
  if(!token||token.length<24)throw new Error('请设置至少 24 字符的桥接访问令牌环境变量');
  if(!Array.isArray(input.routes)||input.routes.length<1||input.routes.length>24)throw new Error('请配置 1 到 24 条固定收件人路由');
  const ids=new Set();
  for(const route of input.routes){
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(route.id)||ids.has(route.id))throw new Error('路由 ID 无效或重复');ids.add(route.id);
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(route.channel)||typeof route.target!=='string'||!route.target||route.target.length>512||/[\r\n\0]/.test(route.target)||route.target.startsWith('-'))throw new Error('渠道或固定收件人无效');
    if(route.account!=null&&!/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,159}$/.test(route.account))throw new Error('帐号 ID 无效');
  }
  return {...input,token,host:input.host||'127.0.0.1',port:input.port||8787,binary:input.binary||'openclaw',timeoutMs:input.timeoutMs||45000};
}

export function openclawArguments(route,event) {
  const args=['message','send','--channel',route.channel,'--target',route.target,'--message',messageText(event),'--json'];
  if(route.account)args.push('--account',route.account);
  return args;
}

export function runOpenClaw(binary,args,timeoutMs) {
  return new Promise(resolve=>{
    let stdout='',finished=false,timedOut=false;
    const child=spawn(binary,args,{shell:false,stdio:['ignore','pipe','pipe']});
    const done=result=>{if(finished)return;finished=true;clearTimeout(timer);resolve(result);};
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),1000).unref();done({ok:false,unknown:true,error:'OpenClaw 未在时限内返回结果，请先在平台核对'});},timeoutMs);
    child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(stdout.length>256*1024){child.kill();done({ok:false,unknown:true,error:'OpenClaw 返回过大，发送结果未确认'});}});
    child.stderr.on('data',()=>{}); // 不把渠道凭据或个人收件人写进 HTTP 日志。
    child.on('error',()=>done({ok:false,unknown:false,error:'无法启动 OpenClaw，请检查安装与 binary 配置'}));
    child.on('close',code=>{
      if(timedOut)return;
      if(code!==0)return done({ok:false,unknown:false,error:`OpenClaw 执行失败（退出码 ${code}），请检查渠道登录、收件人和主动发送权限`});
      let result;
      try{const start=stdout.indexOf('{');result=JSON.parse(stdout.slice(start));}catch{return done({ok:false,unknown:true,error:'OpenClaw 未返回可识别的确认，请在平台核对'});}
      const channel=args[args.indexOf('--channel')+1];
      const levels=[result,result?.payload,result?.payload?.result,result?.payload?.meta,result?.payload?.result?.meta].filter(value=>value&&typeof value==='object');
      const messageId=[result?.messageId,result?.payload?.messageId,result?.payload?.result?.messageId,result?.payload?.receipt?.primaryPlatformMessageId].find(value=>typeof value==='string'&&value.trim());
      if(result?.action!=='send'||result.channel!==channel||result.dryRun!==false||!messageId||levels.some(value=>value.error||value.ok===false||value.dryRun===true||(value.deliveryStatus&&!['sent','delivered'].includes(value.deliveryStatus))))return done({ok:false,unknown:true,error:'OpenClaw 未返回本次发送的有效消息回执，请在平台核对'});
      done({ok:true,delivered:true,messageId});
    });
  });
}

export async function createBridge(config,{stateFile,send=runOpenClaw}={}) {
  const ledgerPath=stateFile||resolve(dirname(fileURLToPath(import.meta.url)),'state/receipts.json');
  let ledger={};try{ledger=JSON.parse(await readFile(ledgerPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('桥接发送记录无法读取，请检查状态文件');}
  // 上次进程退出时仍在发送的消息视为未确认，保留供用户核对。
  for(const row of Object.values(ledger))if(row.status==='sending'){row.status='unknown';row.result={ok:false,unknown:true,error:'上次发送被中断，请在平台核对后重试'};}
  const active=new Map();let saving=Promise.resolve();
  function persist(){const snapshot=JSON.stringify(ledger);saving=saving.then(async()=>{await mkdir(dirname(ledgerPath),{recursive:true,mode:0o700});const temp=ledgerPath+'.tmp';await writeFile(temp,snapshot,{mode:0o600});await rename(temp,ledgerPath);});return saving;}
  function authorized(value){const supplied=Buffer.from(String(value||'')),expected=Buffer.from('Bearer '+config.token);return supplied.length===expected.length&&timingSafeEqual(supplied,expected);}
  async function deliver(key,route,event){
    ledger[key]={status:'sending',at:Date.now()};await persist();
    const result=await send(config.binary,openclawArguments(route,event),config.timeoutMs);
    ledger[key]={status:result.ok?'sent':result.unknown?'unknown':'failed',result,at:Date.now()};
    const ordered=Object.entries(ledger).sort((a,b)=>a[1].at-b[1].at);if(ordered.length>2000)for(const [id]of ordered.slice(0,ordered.length-2000))if(!active.has(id))delete ledger[id];
    try{await persist();}catch{return {ok:false,unknown:true,error:'发送记录保存未确认，请先在平台核对'};}
    return result;
  }
  const server=http.createServer(async(req,res)=>{
    const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    if(!authorized(req.headers.authorization))return reply(401,{ok:false,error:'访问令牌无效'});
    if(req.url==='/health'&&req.method==='GET')return reply(200,{ok:true,routes:config.routes.map(({id,channel,account})=>({id,channel,account:account||'default'}))});
    if(req.url!=='/v1/notify'||req.method!=='POST')return reply(404,{ok:false,error:'接口不存在'});
    let body='';
    try{
      for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>64*1024)return reply(413,{ok:false,error:'请求过大'});}
      const input=JSON.parse(body),event=input.notification;
      if(typeof input.id!=='string'||input.id.length<1||input.id.length>512||!event||event.id!==input.id||typeof event.title!=='string'||typeof event.body!=='string'||event.title.length>200||event.body.length>4000)return reply(400,{ok:false,error:'通知格式无效'});
      if(!Number.isFinite(event.expiresAt)||event.expiresAt<=Date.now())return reply(410,{ok:false,error:'通知已过期'});
      const route=config.routes.find(x=>x.id===input.routeId);if(!route)return reply(404,{ok:false,error:'路由不存在'});
      const platform=route.channel==='qqbot'?'qq':['openclaw-weixin','wechat','weixin'].includes(route.channel)?'wechat':'openclaw';
      if(['wechat','qq'].includes(input.platform)&&input.platform!==platform)return reply(400,{ok:false,error:'所选平台与路由渠道不一致'});
      const key=createHash('sha256').update(route.id+'\0'+input.id).digest('hex');
      const previous=ledger[key];
      if(previous?.status==='sent')return reply(200,{...previous.result,deduplicated:true});
      if(previous?.status==='unknown'&&input.force!==true)return reply(202,previous.result);
      if(!active.has(key)){const pending=deliver(key,route,event).finally(()=>active.delete(key));active.set(key,pending);}
      const result=await active.get(key);
      reply(result.ok?200:result.unknown?202:502,result);
    }catch{reply(400,{ok:false,error:'请求无法处理，请检查配置与通知格式'});}
  });
  return server;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const file=resolve(process.argv[2]||'bridge/config.json');
  const config=validateBridgeConfig(JSON.parse(await readFile(file,'utf8')));
  const server=await createBridge(config);
  server.listen(config.port,config.host,()=>process.stdout.write(`课简通知桥接已启动：${config.host}:${config.port}\n`));
}
