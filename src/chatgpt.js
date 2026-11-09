(function(root){
  'use strict';
  const D=root.ZMADeepSeek||(typeof require!=='undefined'?require('./deepseek.js'):null),ENDPOINT='https://api.openai.com/v1';
  const EFFORTS=['none','minimal','low','medium','high','xhigh','max'];
  const CURRENT=/^gpt-(?:6(?:\.1)?-(?:sol|astra|luna)|5\.6-(?:sol|terra|luna))$/;
  function reasoningEfforts(model){
    const raw=model.supported_reasoning_levels||model.supported_reasoning_efforts||model.reasoning_efforts;
    let levels=raw||model.reasoningEfforts;
    // 0.11.1 cached the three-level fallback without marking its origin.
    if(!raw&&model.capabilitiesVersion!==2&&CURRENT.test(model.slug)&&(!levels||JSON.stringify(levels)==='["low","medium","high"]'))levels=['low','medium','high','xhigh','max'];
    if(Array.isArray(levels))return [...new Set(levels.map(v=>typeof v==='string'?v:v?.effort).filter(v=>EFFORTS.includes(v)))];
    return /^(gpt-[56](?:[.-]|$)|o[134](?:[.-]|$))/.test(model.slug)?['low','medium','high']:[];
  }
  function speedTiers(model){
    const supplied=model.speedTiers||model.service_tiers||model.additional_speed_tiers;
    if(Array.isArray(supplied)){const values=[...(model.speedTiers||[]),...(model.service_tiers||[]),...(model.additional_speed_tiers||[])].map(v=>typeof v==='string'?v:v?.id).map(v=>v==='priority'?'fast':v);return ['default',...['fast','ultrafast'].filter(v=>values.includes(v))];}
    return CURRENT.test(model.slug)?['default','fast',...(['gpt-6-astra','gpt-6.1-sol'].includes(model.slug)?['ultrafast']:[])]:['default'];
  }
  function failure(status,detail){
    const error=detail&&typeof detail==='object'?detail:{code:detail},code=error.code;
    const usage=['subscription_sharing_usage_limit_exceeded','subscription_sharing_usage_unavailable'].includes(code);
    const knownParams=['service_tier','reasoning.effort','reasoning','model','input','store','stream'];
    const param=knownParams.includes(error.param)?error.param:'';
    // Inspect echoed text only to classify the field; never display or persist it.
    const speedRejected=!usage&&[0,400,403].includes(status)&&(param==='service_tier'||['unsupported_service_tier','invalid_service_tier','service_tier_not_supported'].includes(code)||/\bservice[_ ]tier\b/i.test(typeof error.message==='string'?error.message:typeof error.detail==='string'?error.detail:''));
    const safeCode=['subscription_sharing_usage_limit_exceeded','subscription_sharing_usage_unavailable','invalid_request_error','unsupported_parameter','invalid_value','context_length_exceeded'].includes(code)?code:'';
    const diagnostic=[status?'HTTP '+status:'',param?'参数 '+param:'',safeCode?'代码 '+safeCode:''].filter(Boolean).join('；');
    const message=usage?'ChatGPT 订阅额度已用完或暂不可用，请点击“管理用量”检查额度。':speedRejected?'当前账户或订阅接入不接受所选速度档位，请以标准模式重试；不需要重建对话。':status===401?'ChatGPT 登录已失效，请重新登录。':status===429?'ChatGPT 请求限流，请稍后重试。':status===403?'当前 ChatGPT 账户无权使用此模型或速度档位，请切回标准、刷新模型列表或检查授权。':status===400?'ChatGPT 不接受此请求，请检查模型、思考强度、速度档位及所选材料。':'ChatGPT 响应失败，请稍后重试。';
    return Object.assign(new Error(message+(diagnostic?'（'+diagnostic+'）':'')),{safe:true,status,usageLimit:usage,speedRejected,param,code:safeCode});
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
        if(!response.ok){let detail;try{const data=await response.json();detail=data.error||data;}catch{}throw failure(response.status,detail);}return response;
      }
    }
    async models(){
      const id=this.accountID||this.auth.state.activeID;let data;
      try{data=await (await this.request('/models',{},id)).json();}catch(e){throw e.safe?e:failure(0,'');}
      const models=(data.models||[]).filter(m=>m.visibility==='list'&&typeof m.slug==='string'&&/^[a-z0-9._-]{1,128}$/i.test(m.slug)).map(m=>{const levels=reasoningEfforts(m);return {slug:m.slug,displayName:typeof m.display_name==='string'?m.display_name:m.slug,...(levels.length?{reasoningEfforts:levels}:{}),speedTiers:speedTiers(m),capabilitiesVersion:2};});
      if(!models.length)throw Object.assign(new Error('当前 ChatGPT 账户没有可用模型，请检查订阅授权。'),{safe:true});await this.auth.setModels(id,models);return models;
    }
    /** @param {any[]} messages @param {{signal?:AbortSignal,onDelta?:(delta:string)=>void,onServiceTier?:(info:any)=>void,maxTokens?:number,thinking?:any}} options */
    async generate(messages,{signal,onDelta=(_delta)=>{},onServiceTier=(_info)=>{},maxTokens=undefined,thinking=undefined}={}){
      let partial='',completed=false,reader;
      try{
        if(signal?.aborted)throw Error();const id=this.accountID||this.auth.state.activeID;let account=this.auth.state.accounts?.find(a=>a.id===id)||this.auth.active();
        if(!account?.model){await this.models();account=this.auth.state.accounts?.find(a=>a.id===id)||this.auth.active();}
        if(!account?.model)throw Object.assign(new Error('请先选择 ChatGPT 模型。'),{safe:true});
        const model=account.models?.find(m=>m.slug===account.model)||{slug:account.model},levels=reasoningEfforts(model),requested=thinking?.type==='disabled'?'low':account.reasoningEffort,speed=thinking?.type==='disabled'?'default':account.speed||'default';
        if(!speedTiers(model).includes(speed))throw Object.assign(new Error('当前模型不支持所选速度档位，请切换为标准或刷新模型列表。'),{safe:true});
        const body={...requestBody(messages,account.model),service_tier:speed==='fast'?'priority':speed,...(requested&&requested!=='default'&&levels.includes(requested)?{reasoning:{effort:requested}}:{})};
        const response=await this.request('/responses',{method:'POST',signal,headers:{Accept:'text/event-stream'},body:JSON.stringify(body)},id);
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
          else if(value.type==='response.completed'){completed=true;const tier=value.response?.service_tier;onServiceTier({requested:speed,actual:tier==='priority'?'fast':['default','fast','ultrafast'].includes(tier)?tier:null});}
          else if(value.type==='response.failed'||value.type==='error')throw failure(0,value.response?.error||value.error||value);
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
  const api={ChatGPTClient,requestBody,failure,reasoningEfforts,speedTiers};root.ZMAChatGPT=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
