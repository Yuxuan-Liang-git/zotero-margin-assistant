(function(root){
  'use strict';
  const D=root.ZMADeepSeek||(typeof require!=='undefined'?require('./deepseek.js'):null),ENDPOINT='https://api.openai.com/v1';
  function failure(status,code){
    const usage=['subscription_sharing_usage_limit_exceeded','subscription_sharing_usage_unavailable'].includes(code);
    return Object.assign(new Error(usage?'ChatGPT 订阅额度已用完或暂不可用，请点击“管理用量”检查额度。':status===401?'ChatGPT 登录已失效，请重新登录。':status===429?'ChatGPT 请求限流，请稍后重试。':status===403?'当前 ChatGPT 账户无权使用此模型，请刷新模型列表或检查授权。':status===400?'ChatGPT 不接受此请求，请检查模型是否支持所选材料。':'ChatGPT 响应失败，请稍后重试。'),{safe:true,status,usageLimit:usage});
  }
  function requestBody(messages,model){
    const instructions=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
    const input=messages.filter(m=>m.role!=='system').map(m=>{
      if(!['user','assistant','developer'].includes(m.role))throw failure(400,'');
      const content=(Array.isArray(m.content)?m.content:[{type:'text',text:m.content}]).map(part=>{
        if(part.type==='text')return {type:m.role==='assistant'?'output_text':'input_text',text:part.text};
        if(part.type==='image_url'&&m.role==='user')return {type:'input_image',image_url:part.image_url.url};throw failure(400,'');
      });return {role:m.role,content};
    });
    return {model,instructions,input,store:false,stream:true};
  }
  class ChatGPTClient{
    constructor({auth,fetch,TextDecoder:Decoder=globalThis.TextDecoder,accountID=undefined}){this.auth=auth;this.fetch=fetch;this.Decoder=Decoder;this.accountID=accountID;}
    forAccount(id){return new ChatGPTClient({auth:this.auth,fetch:this.fetch,TextDecoder:this.Decoder,accountID:id});}
    async request(path,options={},id=this.accountID||this.auth.state.activeID){
      for(let attempt=0;attempt<2;attempt++){
        const token=await this.auth.accessToken(id,attempt===1),response=await this.fetch(ENDPOINT+path,{...options,redirect:'error',headers:{'Content-Type':'application/json',...options.headers,Authorization:'Bearer '+token}});
        if(response.status===401&&attempt===0){try{await response.body?.cancel();}catch{}continue;}
        if(!response.ok){let code;try{const data=await response.json();code=data.error?.code;}catch{}throw failure(response.status,code);}return response;
      }
    }
    async models(){
      const id=this.accountID||this.auth.state.activeID;let data;
      try{data=await (await this.request('/models',{},id)).json();}catch(e){throw e.safe?e:failure(0,'');}
      const models=(data.models||[]).filter(m=>m.visibility==='list'&&typeof m.slug==='string'&&/^[a-z0-9._-]{1,128}$/i.test(m.slug)).map(m=>({slug:m.slug,displayName:typeof m.display_name==='string'?m.display_name:m.slug}));
      if(!models.length)throw Object.assign(new Error('当前 ChatGPT 账户没有可用模型，请检查订阅授权。'),{safe:true});await this.auth.setModels(id,models);return models;
    }
    /** @param {any[]} messages @param {{signal?:AbortSignal,onDelta?:(delta:string)=>void,maxTokens?:number,thinking?:any}} options */
    async generate(messages,{signal,onDelta=(_delta)=>{},maxTokens=undefined,thinking=undefined}={}){
      let partial='',completed=false,reader;
      try{
        if(signal?.aborted)throw Error();const id=this.accountID||this.auth.state.activeID;let account=this.auth.state.accounts?.find(a=>a.id===id)||this.auth.active();
        if(!account?.model){await this.models();account=this.auth.state.accounts?.find(a=>a.id===id)||this.auth.active();}
        if(!account?.model)throw Object.assign(new Error('请先选择 ChatGPT 模型。'),{safe:true});
        const response=await this.request('/responses',{method:'POST',signal,headers:{Accept:'text/event-stream'},body:JSON.stringify(requestBody(messages,account.model))},id);
        if(!response.body?.getReader)throw Error();reader=response.body.getReader();const decoder=new this.Decoder('utf-8');let buffer='';const refusals=new Set();
        const consume=block=>{
          const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');if(!data||data==='[DONE]')return;
          const value=JSON.parse(data);
          if(value.type==='response.output_text.delta'&&typeof value.delta==='string'){partial+=value.delta;if(partial.length>1000000)throw Error();onDelta(value.delta);}
          else if(value.type==='response.refusal.delta'||value.type==='response.refusal.done'){
            const key=`${value.item_id||''}:${value.content_index||0}`;
            const text=value.type==='response.refusal.delta'?value.delta:refusals.has(key)?'':value.refusal;
            if(typeof text==='string'&&text){refusals.add(key);partial+=text;if(partial.length>1000000)throw Error();onDelta(text);}
          }
          else if(value.type==='response.completed')completed=true;
          else if(value.type==='response.failed'||value.type==='error')throw failure(0,value.response?.error?.code||value.error?.code||value.code);
          else if(value.type==='response.incomplete')throw Object.assign(new Error('ChatGPT 回答未完成，可继续追问或重试。'),{safe:true});
        };
        while(!completed){if(signal?.aborted)throw Error();const chunk=await reader.read();buffer+=chunk.done?decoder.decode():decoder.decode(chunk.value,{stream:true});if(buffer.length>2000000)throw Error();let match;
          while(!completed&&(match=/\r?\n\r?\n/.exec(buffer))){consume(buffer.slice(0,match.index).replace(/\r/g,''));buffer=buffer.slice(match.index+match[0].length);}if(chunk.done)break;
        }
        if(signal?.aborted||!completed)throw Error();return partial;
      }catch(e){const error=e.safe?e:new Error(signal?.aborted?'生成已停止，ChatGPT 已收到的回答未完成。':'ChatGPT 连接中断或响应无效，已收到的回答未完成，请重试。');error.partial=partial;error.incomplete=true;throw error;}
      finally{try{await reader?.cancel();}catch{}try{reader?.releaseLock();}catch{}}
    }
    summarize(previous,messages,options){return D.DeepSeekClient.prototype.summarize.call(this,previous,messages,options);}
  }
  const api={ChatGPTClient,requestBody,failure};root.ZMAChatGPT=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
