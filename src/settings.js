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
  }
  function bindChatGPT(container,api){
    const doc=container.ownerDocument,find=id=>container.querySelector('#zma-'+id),provider=find('provider'),account=find('chatgpt-account'),model=find('chatgpt-model'),status=find('chatgpt-status');let working=false;
    const option=(select,value,label)=>{const node=doc.createElementNS('http://www.w3.org/1999/xhtml','option');node.value=value;node.textContent=label;select.append(node);};
    const render=()=>{const state=api.state();provider.value=state.provider;account.replaceChildren();if(!state.accounts.length)option(account,'','尚未登录');for(const a of state.accounts)option(account,a.id,a.label+(a.signedIn?'':'（已退出）'));account.value=state.activeID||'';
      model.replaceChildren();const current=state.accounts.find(a=>a.id===state.activeID);for(const m of current?.models||[])option(model,m.slug,m.displayName);model.value=current?.model||'';
      provider.disabled=working;account.disabled=working||!state.accounts.length;model.disabled=working||!current?.signedIn;
      for(const id of ['login','add','refresh','logout'])find('chatgpt-'+id).disabled=working||(['refresh','logout'].includes(id)&&!current?.signedIn);find('chatgpt-cancel').disabled=!working&&!state.pending;
      if(!working)status.textContent=state.error||(current?.signedIn?'已登录 '+current.label+'。登录信息已加密保存在本机。':'尚未登录 ChatGPT。');
    };
    const run=async(action,message)=>{if(working)return;working=true;render();status.textContent=message||'处理中…';let result;try{result=await action();}catch(e){result=e.message;}finally{working=false;render();if(typeof result==='string'&&result)status.textContent=result;}};
    provider.addEventListener('change',()=>{const value=provider.value;void run(()=>api.provider(value));});
    account.addEventListener('change',()=>{const value=account.value;void run(()=>api.select(value));});
    model.addEventListener('change',()=>{const value=model.value;void run(()=>api.model(value));});
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
