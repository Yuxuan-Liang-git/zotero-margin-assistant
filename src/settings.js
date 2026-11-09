(function(root){
  'use strict';
  function bind(container,api){
    if(!container||container.dataset.zmaBound==='true')return;container.dataset.zmaBound='true';
    const key=container.querySelector('#zma-api-key'),model=container.querySelector('#zma-api-model'),status=container.querySelector('#zma-api-status');
    model.value=api.model;key.placeholder=api.hasKey?'已保存；留空保留当前密钥':'输入 DeepSeek API Key';if(api.error)status.textContent=api.error;
    const apply=async()=>{if(!/^[a-z0-9._-]{1,64}$/i.test(model.value.trim()))throw new Error('模型名称无效');await api.apply(key.value,model.value);key.value='';key.placeholder='已保存；留空保留当前密钥';status.textContent='已加密保存在本机，重启 Zotero 后仍可使用。';};
    container.querySelector('#zma-api-apply').addEventListener('click',async event=>{const b=event.currentTarget;b.disabled=true;try{await apply();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}});
    container.querySelector('#zma-api-clear').addEventListener('click',async event=>{const b=event.currentTarget;b.disabled=true;try{await api.clear();key.value='';key.placeholder='输入 DeepSeek API Key';status.textContent='密钥已清除。';}catch(e){status.textContent=e.message;}finally{b.disabled=false;}});
    container.querySelector('#zma-api-test').addEventListener('click',async event=>{const b=event.currentTarget;b.disabled=true;try{await apply();status.textContent='正在获取可用模型列表…';const models=await api.test();status.textContent=models.includes(model.value.trim())?'连接成功，当前模型可用。':'连接成功；当前模型不在列表中。可用模型：'+models.join(', ');}catch(e){status.textContent=e.message;}finally{b.disabled=false;}});
    if(api.chatgpt&&container.querySelector('#zma-provider'))bindChatGPT(container,api.chatgpt);
    if(container.querySelector('#zma-font-size'))bindAppearance(container,api.appearance);
    if(container.querySelector('#zma-web-mode'))bindWeb(container,api.web);
    if(container.querySelector('#zma-custom-prompt'))bindPrompt(container,api.prompt);
    const auto=container.querySelector('#zma-reading-auto'),summaryStatus=container.querySelector('#zma-reading-status');if(auto){auto.checked=api.readingSummary?.state().enabled??false;auto.disabled=!api.readingSummary;auto.addEventListener('change',async()=>{auto.disabled=true;try{await api.readingSummary.set(auto.checked);summaryStatus.textContent=auto.checked?'自动摘要已开启，空闲后检查新增问答。':'自动摘要已关闭，可在阅读摘要中手动更新。';}catch(e){summaryStatus.textContent=e.message;}finally{auto.checked=api.readingSummary.state().enabled;auto.disabled=false;}});}
  }
  function bindPrompt(container,api){
    const field=container.querySelector('#zma-custom-prompt'),save=container.querySelector('#zma-prompt-save'),reset=container.querySelector('#zma-prompt-reset'),status=container.querySelector('#zma-prompt-status');
    field.value=api?.state().text||'';field.disabled=save.disabled=reset.disabled=!api;
    const run=async action=>{save.disabled=reset.disabled=true;try{await action();field.value=api.state().text;status.textContent='提示词已保存，下一次聊天或摘要更新生效，重启后保留。';}catch(e){status.textContent=e.message;}finally{save.disabled=reset.disabled=!api;}};
    save.addEventListener('click',()=>void run(()=>api.save(field.value)));reset.addEventListener('click',()=>void run(()=>api.reset()));
  }
  function bindWeb(container,api){
    const mode=container.querySelector('#zma-web-mode'),images=container.querySelector('#zma-web-images'),status=container.querySelector('#zma-web-status');let working=false;
    const render=()=>{const state=api?.state()||{mode:'off',images:false};mode.value=state.mode;images.checked=state.images;mode.disabled=images.disabled=working||!api;};
    const run=async action=>{working=true;render();try{await action();status.textContent='联网和配图设置已保存，下一次发送生效。';}catch(e){status.textContent=e.message;}finally{working=false;render();}};
    mode.addEventListener('change',()=>{const value=mode.value;void run(()=>api.setMode(value));});images.addEventListener('change',()=>{const value=images.checked;void run(()=>api.setImages(value));});render();const dispose=api?.watch(render);if(dispose)container.ownerDocument.defaultView?.addEventListener('unload',dispose,{once:true});
  }
  function bindAppearance(container,api){
    const doc=container.ownerDocument,select=container.querySelector('#zma-font-size'),preview=container.querySelector('#zma-font-preview'),status=container.querySelector('#zma-appearance-status');
    for(let size=12;size<=24;size++){const option=doc.createElementNS('http://www.w3.org/1999/xhtml','option');option.value=String(size);option.textContent=size+' px'+(size===14?'（默认）':'');select.append(option);}
    const render=()=>{const size=api?.state().fontSize||14;select.value=String(size);preview.style.fontSize=size+'px';};select.disabled=!api;render();
    select.addEventListener('change',async()=>{select.disabled=true;try{await api.setFontSize(select.value);status.textContent='字号已保存并即时应用，重启后保留。';}catch(e){status.textContent=e.message;}finally{select.disabled=false;render();}});
    const dispose=api?.watch(render);if(dispose)doc.defaultView?.addEventListener('unload',dispose,{once:true});
  }
  function bindChatGPT(container,api){
    const doc=container.ownerDocument,find=id=>container.querySelector('#zma-'+id),provider=find('provider'),account=find('chatgpt-account'),model=find('chatgpt-model'),reasoning=find('chatgpt-reasoning'),speed=find('chatgpt-speed'),status=find('chatgpt-status');let working=false;
    const option=(select,value,label)=>{const node=doc.createElementNS('http://www.w3.org/1999/xhtml','option');node.value=value;node.textContent=label;select.append(node);};
    const render=()=>{const state=api.state();provider.value=state.provider;account.replaceChildren();if(!state.accounts.length)option(account,'','尚未登录');for(const a of state.accounts)option(account,a.id,a.label+(a.signedIn?'':'（已退出）'));account.value=state.activeID||'';
      model.replaceChildren();const current=state.accounts.find(a=>a.id===state.activeID);for(const m of current?.models||[])option(model,m.slug,m.displayName);model.value=current?.model||'';
      if(reasoning){const labels={default:'模型默认',none:'关闭',minimal:'最少',low:'轻量 Light',medium:'中等 Medium',high:'高 High',xhigh:'超高 Extra High',max:'最大 Max'},levels=state.reasoningEfforts||current?.models?.find(m=>m.slug===current.model)?.reasoningEfforts||[];reasoning.replaceChildren();for(const value of ['default',...levels])option(reasoning,value,labels[value]||value);reasoning.value=levels.includes(current?.reasoningEffort)?current.reasoningEffort:'default';reasoning.disabled=working||!current?.signedIn;}
      if(speed){const levels=state.speedTiers||current?.models?.find(m=>m.slug===current.model)?.speedTiers||['default'],labels={default:'标准 Standard',fast:'快速 Fast（更多用量）',ultrafast:'极速 Ultrafast（需账户资格）'};speed.replaceChildren();for(const value of levels)option(speed,value,labels[value]||value);speed.value=levels.includes(current?.speed)?current.speed:'default';speed.disabled=working||!current?.signedIn;}
      provider.disabled=working;account.disabled=working||!state.accounts.length;model.disabled=working||!current?.signedIn;
      for(const id of ['login','add','refresh','logout'])find('chatgpt-'+id).disabled=working||(['refresh','logout'].includes(id)&&!current?.signedIn);find('chatgpt-cancel').disabled=!working&&!state.pending;
      if(!working)status.textContent=state.error||(current?.signedIn?'已登录 '+current.label+'。登录信息已加密保存在本机。':'尚未登录 ChatGPT。');
    };
    const run=async(action,message)=>{if(working)return;working=true;render();status.textContent=message||'处理中…';let result;try{result=await action();}catch(e){result=e.message;}finally{working=false;render();if(typeof result==='string'&&result)status.textContent=result;}};
    provider.addEventListener('change',()=>{const value=provider.value;void run(()=>api.provider(value));});
    account.addEventListener('change',()=>{const value=account.value;void run(()=>api.select(value));});
    model.addEventListener('change',()=>{const value=model.value;void run(()=>api.model(value));});
    reasoning?.addEventListener('change',()=>{const value=reasoning.value;void run(()=>api.reasoning(value));});
    speed?.addEventListener('change',()=>{const value=speed.value;void run(()=>api.speed(value));});
    find('chatgpt-login').addEventListener('click',()=>void run(()=>api.login(account.value||undefined),'请在浏览器完成 OpenAI 授权；本窗口会自动更新…'));
    find('chatgpt-add').addEventListener('click',()=>void run(()=>api.login(undefined),'请在浏览器选择其他 ChatGPT 账户或工作区…'));
    find('chatgpt-cancel').addEventListener('click',()=>api.cancel());
    find('chatgpt-refresh').addEventListener('click',()=>void run(()=>api.refresh(),'正在读取当前账户的模型列表…'));
    find('chatgpt-logout').addEventListener('click',()=>void run(()=>api.logout(),'正在退出 ChatGPT…'));
    find('chatgpt-usage').addEventListener('click',()=>api.usage());
    const dispose=api.watch(render);doc.defaultView?.addEventListener('unload',dispose,{once:true});render();
  }
  root.ZMASettings={bind};if(typeof module!=='undefined')module.exports=root.ZMASettings;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
