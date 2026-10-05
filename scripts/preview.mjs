import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../plugin-packages/multi-platform-notify');
const seed={version:8,page:'feed',context:{timeZone:'Asia/Shanghai',fontScale:1,theme:{background:'#f3f8f5',surface:'#ffffff',surfaceVariant:'#eaf3ed',onSurface:'#1b2a21',onSurfaceVariant:'#6a786f',primary:'#258360',onPrimary:'#ffffff',outlineVariant:'#dbe5df',error:'#b3261e'}},data:{notificationTargets:[]}};
const sdkScript=`(()=>{const listeners=new Set();let config={targets:[]},history=[];const state=${JSON.stringify(seed)};
window.CurSimpleComponent={state,subscribe(f){listeners.add(f);f(state)},async request(command,payload){
 if(command==='notification.config.get')return {values:config,hosts:[]};
 if(command==='notification.config.save'){config=payload.values;state.data.notificationTargets=payload.targets;listeners.forEach(f=>f(state));return true;}
 if(command==='notification.history')return history;
 if(command==='notification.fetch'){
  const url=payload.url;let value={};
  if(url.includes('get_bot_qrcode'))value={qrcode:'demo-qr',qrcode_img_content:'CurSimple demo QR only'};
  else if(url.includes('get_qrcode_status'))value=url.includes('verify_code=')?{status:'confirmed',bot_token:'demo-token',ilink_bot_id:'demo-bot',ilink_user_id:'demo-owner',baseurl:'https://ilinkai.weixin.qq.com'}:{status:'need_verifycode'};
  else if(url.includes('getupdates'))value={ret:0,get_updates_buf:'demo-cursor',msgs:[{from_user_id:'demo-owner',context_token:'demo-context'}]};
  else if(url.includes('getAppAccessToken'))value={access_token:'demo-token',expires_in:7200};
  else if(url.endsWith('/gateway'))value={url:'wss://api.sgroup.qq.com/websocket/'};
  return {ok:true,status:200,body:JSON.stringify(value)};
 }

 if(command==='notification.test'){if(window.previewFail)throw new Error('演示：平台未确认发送');const now=Date.now(),notification={id:'test/'+now,title:'课简通知测试',kind:'test',sourceName:'课简',createdAt:now,expiresAt:now+86400000};const row={notification,targetIds:[payload.targetId],receipts:[{targetId:payload.targetId,status:window.previewStatus||'sent'}],attempts:1};history.unshift(row);return {status:window.previewStatus||'sent'};}
 if(command==='notification.retry')return true;
 if(command==='ui.openExternal')return true;
 throw new Error('预览不支持的操作');
}};
window.WebSocket=class {
 constructor(){this.readyState=1;setTimeout(()=>this.onmessage?.({data:JSON.stringify({op:10,d:{heartbeat_interval:60000}})}),0);}
 send(text){if(JSON.parse(text).op===2)setTimeout(()=>{if(this.readyState!==1)return;this.onmessage?.({data:JSON.stringify({op:0,t:'READY',d:{}})});setTimeout(()=>{if(this.readyState!==1)return;const code=document.querySelector('#qq-progress')?.textContent.match(/课简绑定[0-9]{6}/)?.[0];const group=document.querySelector('#targetType')?.value==='group';this.onmessage?.({data:JSON.stringify({op:0,t:group?'GROUP_AT_MESSAGE_CREATE':'C2C_MESSAGE_CREATE',d:{content:code,group_openid:'demo_group_openid_1234567890',author:{user_openid:'demo_user_openid_1234567890'}}})});},500);},0);}
 close(){this.readyState=3;}
};window.previewState={get config(){return config},get history(){return history},set history(v){history=v}};})();`;
const server=http.createServer(async(req,res)=>{if(req.url==='/'){res.writeHead(302,{Location:'/ui/index.html'}).end();return;}try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const path=resolve(root,'.'+(pathname==='/'?'/ui/index.html':pathname));if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}let body=await readFile(path);const type=extname(path);if(type==='.html')body=Buffer.from(body.toString().replace('</head>','<script>'+sdkScript+'</script></head>').replace('<body>','<body><p class=hint style="padding:12px 18px">演示模式：二维码、绑定和消息均为模拟，不会连接真实平台。</p>'));res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[type]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404).end();}});
server.listen(8766,'127.0.0.1',()=>process.stdout.write('组件演示预览：http://127.0.0.1:8766/（不会连接真实平台）\n'));
