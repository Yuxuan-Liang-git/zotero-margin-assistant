(function(root){
  'use strict';
  function bind(container,api){
    if(!container||container.dataset.zmaBound==='true')return;container.dataset.zmaBound='true';
    const key=container.querySelector('#zma-api-key'),model=container.querySelector('#zma-api-model'),status=container.querySelector('#zma-api-status');
    model.value=api.model;key.placeholder=api.hasKey?'已设置；留空保留当前密钥':'输入 DeepSeek API Key';
    const apply=()=>{if(!/^[a-z0-9._-]{1,64}$/i.test(model.value.trim()))throw new Error('模型名称无效');api.apply(key.value,model.value);key.value='';key.placeholder='已应用；留空保留当前密钥';status.textContent='已应用，仅保存在当前 Zotero 会话。';};
    container.querySelector('#zma-api-apply').addEventListener('click',()=>{try{apply();}catch(e){status.textContent=e.message;}});
    container.querySelector('#zma-api-clear').addEventListener('click',()=>{api.clear();key.value='';key.placeholder='输入 DeepSeek API Key';status.textContent='密钥已清除。';});
    container.querySelector('#zma-api-test').addEventListener('click',async event=>{const b=event.currentTarget;b.disabled=true;try{apply();status.textContent='正在获取可用模型列表…';const models=await api.test();status.textContent=models.includes(model.value.trim())?'连接成功，当前模型可用。':'连接成功；当前模型不在列表中。可用模型：'+models.join(', ');}catch(e){status.textContent=e.message;}finally{b.disabled=false;}});
  }
  root.ZMASettings={bind};if(typeof module!=='undefined')module.exports=root.ZMASettings;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
