import {materialIcon} from './material-icons.js';
const sdk=window.CurSimpleWidget;
const state=sdk.state;
const context=state.context;
const theme=context.theme||{};
for(const [key,token] of Object.entries({primary:'accent',onPrimary:'on-accent',surfaceContainerLow:'surface',primaryContainer:'row',onSurface:'ink',onSurfaceVariant:'muted',error:'danger'})) {
 if(/^#[\da-f]{6}$/i.test(theme[key]||''))document.documentElement.style.setProperty('--'+token,theme[key]);
}
document.documentElement.style.colorScheme=theme.dark?'dark':'light';
const compact=context.width<180||context.height<120;
if(compact)document.body.classList.add('compact');
document.documentElement.style.setProperty('--font-scale',context.fontScale);
const data=state||{};
const targets=Array.isArray(data.notificationTargets)?data.notificationTargets:[];
document.getElementById('brand').innerHTML=materialIcon('send');
const enabled=targets.filter(x=>x.enabled!==false).length;
document.getElementById('count').textContent=targets.length?`${compact?'':'已启用 '}${enabled}/${targets.length}`:'';
const list=document.getElementById('targets');
const empty=document.getElementById('empty');
empty.innerHTML=targets.length?'':`${materialIcon('plus')}<span><b>尚未添加通知目标</b><small>点按添加微信、QQ、飞书等平台</small></span>`;
empty.style.display=targets.length?'none':'flex';
for(const target of targets.slice(0,8)){
 const row=document.createElement('article');row.className='target';row.dataset.action='settings';
 const dot=document.createElement('span');dot.className='dot'+(target.enabled===false?' off':'');
 const name=document.createElement('span');name.className='name';name.textContent=target.name||'未命名目标';
 const meta=document.createElement('span');meta.className='meta';meta.textContent=target.enabled===false?'已暂停':'已启用';
 row.append(dot,name,meta);list.append(row);
}
setTimeout(()=>{
 const bottom=document.getElementById('widget').getBoundingClientRect().bottom-8;
 for(const row of [...list.children])if(row.getBoundingClientRect().bottom>bottom)row.remove();
 const areas=[...document.querySelectorAll('[data-action]')].filter(node=>node.getBoundingClientRect().height>0).map(node=>{
  const box=node.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height,action:node.dataset.action};
 });
 sdk.ready(areas);
},0);
