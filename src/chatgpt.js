(function(root){
  'use strict';
  const D=root.ZMADeepSeek||(typeof require!=='undefined'?require('./deepseek.js'):null),ENDPOINT='https://api.openai.com/v1';
  const W=root.ZMAWeb||(typeof require!=='undefined'?require('./web.js'):null);
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
  function safeParam(value){
    if(typeof value!=='string'||value.length>160)return '';
    if(['service_tier','reasoning.effort','reasoning','model','input','store','stream','tools','include','tool_choice'].includes(value))return value;
    return /^(?:input(?:\[\d{1,6}\])?(?:\.content(?:\[\d{1,6}\])?)?(?:\.(?:type|text|role|image_url|file_data|filename))?|tools(?:\[\d{1,6}\])?(?:\.(?:type|search_content_types|image_settings))?)$/.test(value)?value:'';
  }
  function failure(status,detail,metadata={}){
    const object=detail&&typeof detail==='object'?detail:null;
    const error=object?.error&&typeof object.error==='object'?object.error:object||{code:detail};
    const validation=Array.isArray(object?.detail)?object.detail:[];
    const text=[typeof detail==='string'?detail:'',error.message,error.detail,typeof object?.error==='string'?object.error:''].filter(v=>typeof v==='string').join('\n').slice(0,16000);
    const location=validation.map(v=>Array.isArray(v?.loc)?v.loc.filter((_,i)=>!(i===0&&v.loc[0]==='body')).map((v,i)=>typeof v==='number'?`[${v}]`:(i?'.':'')+v).join(''):'').map(safeParam).find(Boolean)||'';
    const named=/(?:unsupported|unknown|unrecognized|invalid|missing)\s+(?:(?:request\s+)?(?:parameter|field)|value\s+for)\s*:?\s*['"]?([a-z_][a-z0-9_.\[\]]*)/i.exec(text)?.[1];
    const param=safeParam(error.param)||location||safeParam(named)||'';
    const code=error.code;
    const usage=['subscription_sharing_usage_limit_exceeded','subscription_sharing_usage_unavailable'].includes(code);
    // Inspect echoed text only to classify the field; never display or persist it.
    const speedRejected=!usage&&[0,400,403].includes(status)&&(param==='service_tier'||['unsupported_service_tier','invalid_service_tier','service_tier_not_supported'].includes(code)||/\bservice[_ ]tier\b/i.test(text));
    const webRejected=!usage&&[0,400,403].includes(status)&&(/^(?:tools(?:\[\d+\])?(?:\.[a-z_]+)?|include|tool_choice)$/.test(param)||/web_search/i.test(text));
    const reasoningRejected=!usage&&[0,400,403].includes(status)&&['reasoning','reasoning.effort'].includes(param);
    const inputRejected=!usage&&[0,400].includes(status)&&/^input(?:\[|\.|$)/.test(param);
    const safeCode=['subscription_sharing_usage_limit_exceeded','subscription_sharing_usage_unavailable','subscription_sharing_unsupported_capability','subscription_sharing_user_not_eligible','subscription_sharing_route_not_supported','subscription_sharing_invalid_user','subscription_sharing_user_unavailable','chatpass_v2_scope_not_authorized','chatpass_v2_invalid_authorization_context','invalid_request_error','unsupported_parameter','invalid_value','context_length_exceeded','unsupported_service_tier','invalid_service_tier','service_tier_not_supported'].includes(code)?code:'';
    const responseShape=metadata.responseShape||(object?.error&&typeof object.error==='object'?'error-object':typeof object?.error==='string'?'error-string':validation.length?'validation-list':typeof object?.detail==='string'?'detail-string':object?'json-object':typeof detail==='string'?'string':'empty');
    const requestID=typeof metadata.requestID==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(metadata.requestID)?metadata.requestID:'';
    const diagnostic=[status?'HTTP '+status:'',param?'参数 '+param:'',safeCode?'代码 '+safeCode:''].filter(Boolean).join('；');
    const message=usage?'ChatGPT 订阅额度已用完或暂不可用，请点击“管理用量”检查额度。':code==='context_length_exceeded'?'本轮上下文超过模型限制，原对话已保留；请新建对话或减少附加材料后重试。':webRejected?'当前模型或账户不接受联网搜索/配图参数，请关闭联网搜索后重试，或更换模型。':speedRejected?'当前账户或订阅接入不接受所选速度档位，请以标准模式重试；不需要重建对话。':reasoningRejected?'当前模型或订阅接入不接受所选思考强度，请使用模型默认重试。':inputRejected?/\.(?:file_data|filename)$/.test(param)?'服务端拒绝了 PDF/文件输入，原文件和对话已保留。请复制错误诊断以定位文件或模型兼容问题。':/\.image_url$/.test(param)?'服务端拒绝了图片输入，原选区和对话已保留。请复制错误诊断以定位图片或模型兼容问题。':'服务端拒绝了文档或对话输入，原问题和材料已保留。请复制错误诊断以定位具体字段。':status===401?'ChatGPT 登录已失效，请重新登录。':status===429?'ChatGPT 请求限流，请稍后重试。':status===403?'当前 ChatGPT 账户权限或接入策略拒绝此请求，请复制错误诊断并检查授权。':status===400?'ChatGPT 请求被服务端拒绝，具体原因尚未明确。请复制错误诊断；原问题和材料已保留。':'ChatGPT 响应失败，请稍后重试。';
    const details={status,param,code:safeCode,requestID,responseShape};
    return Object.assign(new Error(message+(diagnostic?'（'+diagnostic+'）':'')),{safe:true,status,usageLimit:usage,speedRejected,webRejected,reasoningRejected,param,code:safeCode,diagnostic:details,diagnosticText:JSON.stringify(details,null,2)});
  }
  function requestBody(messages,model){
    const instructions=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
    const input=messages.filter(m=>m.role!=='system').map(m=>{
      if(!['user','assistant','developer'].includes(m.role))throw failure(400,'');
      const content=(Array.isArray(m.content)?m.content:[{type:'text',text:m.content}]).map(part=>{
        if(part.type==='text')return {type:m.role==='assistant'?'output_text':'input_text',text:part.text};
        if(part.type==='file'&&m.role==='user')return {type:'input_file',filename:part.file.filename,file_data:part.file.file_data};
        if(part.type==='image_url'&&m.role==='user')return {type:'input_image',image_url:part.image_url.url};throw failure(400,'');
      });return {role:m.role,content};
    });
    return {model,instructions,input,store:false,stream:true};
  }
  class ChatGPTClient{
    constructor({auth,fetch,TextDecoder:Decoder=globalThis.TextDecoder,accountID=undefined,getWebOptions=()=>({mode:'off',images:false})}){this.auth=auth;this.fetch=fetch;this.Decoder=Decoder;this.accountID=accountID;this.getWebOptions=getWebOptions;}
    forAccount(id){return new ChatGPTClient({auth:this.auth,fetch:this.fetch,TextDecoder:this.Decoder,accountID:id,getWebOptions:this.getWebOptions});}
    async request(path,options={},id=this.accountID||this.auth.state.activeID){
      for(let attempt=0;attempt<2;attempt++){
        const token=await this.auth.accessToken(id,attempt===1),response=await this.fetch(ENDPOINT+path,{...options,redirect:'error',headers:{'Content-Type':'application/json',...options.headers,Authorization:'Bearer '+token}});
        if(response.status===401&&attempt===0){try{await response.body?.cancel();}catch{}continue;}
        if(!response.ok){let detail,responseShape;try{detail=await response.json();}catch{responseShape='non-json';}throw failure(response.status,detail,{requestID:response.headers?.get('x-request-id'),responseShape});}return response;
      }
    }
    async models(){
      const id=this.accountID||this.auth.state.activeID;let data;
      try{data=await (await this.request('/models',{},id)).json();}catch(e){throw e.safe?e:failure(0,'');}
      const models=(data.models||[]).filter(m=>m.visibility==='list'&&typeof m.slug==='string'&&/^[a-z0-9._-]{1,128}$/i.test(m.slug)).map(m=>{const levels=reasoningEfforts(m);return {slug:m.slug,displayName:typeof m.display_name==='string'?m.display_name:m.slug,...(levels.length?{reasoningEfforts:levels}:{}),speedTiers:speedTiers(m),capabilitiesVersion:2};});
      if(!models.length)throw Object.assign(new Error('当前 ChatGPT 账户没有可用模型，请检查订阅授权。'),{safe:true});await this.auth.setModels(id,models);return models;
    }
    /** @param {any[]} messages @param {{signal?:AbortSignal,onDelta?:(delta:string)=>void,onServiceTier?:(info:any)=>void,onWebUpdate?:(info:any)=>void,maxTokens?:number,thinking?:any}} options */
    async generate(messages,{signal,onDelta=(_delta)=>{},onServiceTier=(_info)=>{},onWebUpdate=(_info)=>{},maxTokens=undefined,thinking=undefined}={}){
      let partial='',completed=false,reader,requestInfo;const webState={used:false,citations:[],sources:[],images:[]},offsets=new Map();
      try{
        if(signal?.aborted)throw Error();const id=this.accountID||this.auth.state.activeID;let account=this.auth.state.accounts?.find(a=>a.id===id)||this.auth.active();
        if(!account?.model){await this.models();account=this.auth.state.accounts?.find(a=>a.id===id)||this.auth.active();}
        if(!account?.model)throw Object.assign(new Error('请先选择 ChatGPT 模型。'),{safe:true});
        const model=account.models?.find(m=>m.slug===account.model)||{slug:account.model},levels=reasoningEfforts(model),requested=thinking?.type==='disabled'?'low':account.reasoningEffort,speed=thinking?.type==='disabled'?'default':account.speed||'default';
        if(!speedTiers(model).includes(speed))throw Object.assign(new Error('当前模型不支持所选速度档位，请切换为标准或刷新模型列表。'),{safe:true});
        /** @type {any} */
        const body={...requestBody(messages,account.model),service_tier:speed==='fast'?'priority':speed,...(requested&&requested!=='default'&&levels.includes(requested)?{reasoning:{effort:requested}}:{})};
        const web=thinking?.type==='disabled'?{mode:'off'}:this.getWebOptions();
        if(web?.mode==='auto'){body.tools=[{type:'web_search',...(web.images?{search_content_types:['text','image'],image_settings:{max_results:3,caption:true}}:{})}];body.tool_choice='auto';body.include=['web_search_call.action.sources',...(web.images?['web_search_call.results']:[])];body.instructions+='\n回答先给直观结论，再按问题需要解释关键概念、公式和例子，避免机械套用固定长模板。以当前PDF为主；需要外部背景、相关研究、最新资料或配图时主动检索网络，优先原始论文与官方资料，标明外部来源，区分论文内容和补充说明。仅在实际检索后声称联网。网络图片只选有助于解释的图，注明出处，不称为当前论文原图，不编造图片地址。';}
        const parts=body.input.flatMap(m=>m.content);requestInfo={model:/^[a-z0-9._-]{1,128}$/i.test(body.model)?body.model:'',reasoning:body.reasoning?.effort||'default',serviceTier:body.service_tier,webSearch:!!body.tools?.length,messages:body.input.length,images:parts.filter(p=>p.type==='input_image').length,files:parts.filter(p=>p.type==='input_file').length};
        const response=await this.request('/responses',{method:'POST',signal,headers:{Accept:'text/event-stream'},body:JSON.stringify(body)},id);
        if(!response.body?.getReader)throw Error();reader=response.body.getReader();const decoder=new this.Decoder('utf-8');let buffer='';const refusals=new Set();
        const consume=block=>{
          const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');if(!data||data==='[DONE]')return;
          const value=JSON.parse(data),key=`${value.item_id||''}:${value.content_index||0}`;if(value.type==='response.output_text.delta'&&!offsets.has(key))offsets.set(key,Array.from(partial).length);if(W&&(value.type.startsWith('response.web_search_call.')||['response.output_text.annotation.added','response.output_item.done','response.completed'].includes(value.type))){W.collect(webState,value,offsets.get(key)??offsets.get(`${value.item?.id||''}:0`)??0);if(webState.used||webState.citations.length||webState.images.length)onWebUpdate(W.clean(webState));}
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
      }catch(e){const error=e.safe?e:new Error(signal?.aborted?'生成已停止，ChatGPT 已收到的回答未完成。':'ChatGPT 连接中断或响应无效，已收到的回答未完成，请重试。');if(error.diagnostic){error.diagnostic={...error.diagnostic,...(requestInfo?{request:requestInfo}:{})};error.diagnosticText=JSON.stringify(error.diagnostic,null,2);}error.partial=partial;error.incomplete=true;throw error;}
      finally{try{await reader?.cancel();}catch{}try{reader?.releaseLock();}catch{}}
    }
    summarize(previous,messages,options){return D.DeepSeekClient.prototype.summarize.call(this,previous,messages,options);}
  }
  const api={ChatGPTClient,requestBody,failure,reasoningEfforts,speedTiers};root.ZMAChatGPT=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
