import {createTools,bindAction} from './tools-shell.js';
export function testPayload(targetId,title,body) {
  if(!targetId)throw new Error('请选择通知目标');
  title=String(title).trim();body=String(body).trim();
  if(!title || title.length>120)throw new Error('标题须为 1–120 字符');
  if(!body || body.length>2000)throw new Error('正文须为 1–2000 字符');
  return {targetId,title,body};
}

const outcomes={sent:'平台已确认发送，请在目标平台核对消息',accepted:'平台已接收请求，尚未确认最终送达',queued:'等待平台结果，请在发送记录中继续查看',unknown:'结果未确认，请在接收端核对',failed:'发送失败，请查看发送记录',skipped:'本次发送已跳过'};

export function notificationTools({sdk,snapshot,icon,esc,toast,platforms}) {
  const sendState={};
  return createTools({sdk,snapshot,icon,esc,toast,mark:'send',subtitle:'把课简提醒送到你常用的平台。',aboutFeatures:[
    {icon:'send',title:'多平台接收',description:'绑定微信、QQ、飞书等常用通知渠道'},
    {icon:'bell',title:'按需推送',description:'为每个目标单独选择课程、笔记或组件提醒'},
    {icon:'clock',title:'发送记录',description:'查看平台回执，跟进未确认的发送结果'},
  ],features:[
    {id:'send',title:'发送测试',description:'选择接收目标，自定义标题与正文',icon:'send',render({root,card,memory,navigate}){
      memory.title??='课简通知测试';memory.body??='这是一条连接测试消息。收到它表示当前目标已接入。';
      let targets=[],alive=true;
      root.innerHTML='<p class="tool-intro">每次仅发送到选中的目标。测试会使用该目标的正文设置，也可以测试已暂停的绑定。</p><h2>接收目标</h2><div class="tool-targets" id="test-targets" role="radiogroup" aria-label="接收目标"><p class="tool-empty">正在读取目标…</p></div>'+card(`<label class="tool-field">消息标题<input id="test-title" maxlength="120" value="${esc(memory.title)}" autocomplete="off"></label><label class="tool-field">消息正文<textarea id="test-body" maxlength="2000">${esc(memory.body)}</textarea></label><p class="tool-intro" id="test-body-hint"></p>`)+`<button class="primary" id="test-send" data-unavailable="true" disabled>${icon('send')}发送测试消息</button><p data-result class="tool-result" role="status" ${memory.result?'':'hidden'}>${esc(memory.result||'')}</p><div class="tool-actions"><button class="secondary" id="test-records">查看发送记录</button></div>`;
      const hint=()=>{const target=targets.find(x=>x.id===memory.targetId);root.querySelector('#test-body-hint').textContent=target?.includeBody===false?'该目标已关闭正文推送，本次只发送标题。':'标题最多 120 字符，正文最多 2000 字符。';};
      const draw=()=>{
        root.querySelector('#test-targets').innerHTML=targets.length?targets.map(t=>`<button class="tool-target" role="radio" aria-checked="${t.id===memory.targetId}" data-target="${esc(t.id)}"><span class="tool-copy">${esc(t.name)}<small>${esc(platforms[t.platform]?.name||t.platform)} · ${t.enabled?'已启用':'已暂停'}</small></span><span class="tool-radio" aria-hidden="true"></span></button>`).join(''):'<p class="tool-empty">还没有绑定目标，请返回首页添加。</p>';
        root.querySelectorAll('[data-target]').forEach((b,index)=>{
          b.tabIndex=memory.targetId?(b.dataset.target===memory.targetId?0:-1):(index===0?0:-1);
          b.onclick=()=>{memory.targetId=b.dataset.target;draw();};
          b.onkeydown=e=>{if(!['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(e.key))return;e.preventDefault();const delta=['ArrowDown','ArrowRight'].includes(e.key)?1:-1;memory.targetId=targets[(index+delta+targets.length)%targets.length].id;draw();root.querySelector('[aria-checked=true]').focus();};
        });hint();
        root.querySelector('#test-send').dataset.unavailable=String(!memory.targetId);root.querySelector('#test-send').disabled=!memory.targetId||!!sendState.busy;
        root.querySelectorAll('input,textarea,[data-target]').forEach(x=>x.disabled=!!sendState.busy);
      };
      const load=async()=>{
        try{const value=await sdk.request('notification.config.get');if(!alive)return;targets=value.values?.targets||[];if(!targets.some(x=>x.id===memory.targetId))memory.targetId='';draw();}
        catch(e){if(!alive)return;root.querySelector('#test-targets').innerHTML=`<p class="tool-result tool-error">${esc(e.message)}</p><button class="secondary" id="targets-retry">重新读取</button>`;root.querySelector('#targets-retry').onclick=load;}
      };
      root.querySelector('#test-title').oninput=e=>memory.title=e.target.value;
      root.querySelector('#test-body').oninput=e=>memory.body=e.target.value;
      root.querySelector('#test-records').onclick=()=>navigate('history');
      bindAction(root,'test-send',async()=>{
        if(!snapshot().context?.diagnostics?.testContentSupported)throw new Error('请安装新版课简后使用自定义测试内容');
        const payload=testPayload(memory.targetId,memory.title,memory.body),target=targets.find(x=>x.id===payload.targetId);
        const fields=[...root.querySelectorAll('input,textarea,[data-target]')];fields.forEach(x=>x.disabled=true);
        try{const receipt=await sdk.request('notification.test',payload);memory.result=`${target.name}：${outcomes[receipt.status]||'结果未确认，请查看发送记录'}`;return memory.result;}
        catch(e){memory.result=`${target.name}：${e.message||'发送未完成'}。可在发送记录中核对。`;throw new Error(memory.result);}
        finally{fields.forEach(x=>x.disabled=false);}
      },{working:'正在发送，请稍候…',state:sendState});
      const updateFields=()=>{if(!alive){sendState.views.delete(updateFields);return;}root.querySelectorAll('input,textarea,[data-target]').forEach(x=>x.disabled=!!sendState.busy);};sendState.views.add(updateFields);
      load();return ()=>{alive=false;sendState.views.delete(updateFields);};
    }},
    {id:'history',title:'发送记录',description:'逐条查看目标、时间和平台回执',icon:'clock',render({root,card,circle,memory}){
      root.innerHTML=`<div class="tool-toolbar"><p class="tool-intro">最近 80 条记录 · 平台回执不等同于接收端已读</p>${circle('history-refresh','refresh','刷新发送记录')}</div><p data-result class="tool-result" role="status" hidden></p><div id="test-history"></div>`;
      const draw=rows=>root.querySelector('#test-history').innerHTML=rows.length?rows.map(row=>card(`<h2>${esc(row.notification.title)}</h2><p class="tool-intro">${esc(new Date(row.notification.createdAt).toLocaleString('zh-CN',{timeZone:snapshot().context?.timeZone||'Asia/Shanghai',hour12:false}))}</p><p class="tool-log">${esc(row.notification.body||'无正文')}</p>${row.targetIds.map(id=>{const receipt=row.receipts.find(x=>x.targetId===id);return `<div class="tool-result"><strong>${esc(memory.names?.[id]||'已移除目标')}</strong><p>${esc(outcomes[receipt?.status]||'待发送')}</p>${receipt?.error?`<p>${esc(receipt.error)}</p>`:''}</div>`;}).join('')}`)).join(''):'<p class="tool-empty">暂无发送记录</p>';
      bindAction(root,'history-refresh',async()=>{
        const [rows,config]=await Promise.all([sdk.request('notification.history'),sdk.request('notification.config.get')]);
        memory.names=Object.fromEntries((config.values?.targets||[]).map(t=>[t.id,t.name]));memory.rows=rows;draw(rows);return `已读取 ${rows.length} 条发送记录`;
      },{working:'正在读取发送记录…'});
      draw(memory.rows||[]);root.querySelector('#history-refresh').click();
    }},
    {id:'widget',title:'小组件检查',description:'请求刷新通知小组件',icon:'calendar',render({root,card,pairs}){
      const widgets=snapshot().manifest.extension?.widgets||[];
      root.innerHTML=card('<h2>组件提供的小组件</h2>'+pairs(widgets.map(x=>[x.title||x.name||x.id,x.id])))+'<p class="tool-intro">刷新已添加到桌面的通知小组件，请在桌面核对显示结果。</p><button class="primary" id="widget-refresh">'+icon('refresh')+'刷新桌面小组件</button><p data-result class="tool-result" role="status" hidden></p>';
      bindAction(root,'widget-refresh',async()=>{await sdk.request('debug.refreshWidget');return '已请求刷新，请在桌面检查小组件';},{working:'正在请求刷新…'});
    }},
  ]});
}
