(function(root){
  'use strict';
  const D=root.ZMADeepSeek||(typeof require!=='undefined'?require('./deepseek.js'):null);
  const ENDPOINT='https://generativelanguage.googleapis.com/v1beta';
  const VALID=/^gemini-[a-z0-9._-]{1,110}$/i;
  function error(message,status=0){return Object.assign(new Error(message),{status,safe:true});}
  function statusError(status){
    const message={400:'Gemini 拒绝了请求，请核对模型及附件格式。',401:'Gemini API Key 无效，请检查设置。',403:'Gemini 拒绝访问，请检查 API Key、项目权限及服务地区。',404:'Gemini 模型已不可用，请在设置中刷新模型。',413:'Gemini 请求过大，请减少附件或新建对话。',429:'Gemini 请求达到频率或用量限制，请稍后重试。'}[status]||'Gemini 服务暂时不可用，请稍后重试。';
    return error(message,status);
  }
  function parts(content){
    if(typeof content==='string')return content?[{text:content}]:[];
    return (content||[]).flatMap(part=>{
      if(part.type==='text'&&typeof part.text==='string')return part.text?[{text:part.text}]:[];
      const match=/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(part.type==='image_url'?part.image_url?.url:part.type==='file'?part.file?.file_data:'');
      if(!match||((part.type==='file')!==(match[1]==='application/pdf')))throw error('Gemini 附件格式无效，请重新添加。');
      return [{inlineData:{mimeType:match[1],data:match[2]}}];
    });
  }
  function requestBody(messages,maxTokens){
    const system=[],contents=[];
    for(const m of messages){
      const parsed=parts(m.content);if(!parsed.length)continue;
      if(m.role==='system'){system.push(...parsed);continue;}
      const role=m.role==='assistant'?'model':'user',last=contents.at(-1);
      if(last?.role===role)last.parts.push(...parsed);else contents.push({role,parts:parsed});
    }
    return {contents,...(system.length?{systemInstruction:{parts:system}}:{}),...(maxTokens?{generationConfig:{maxOutputTokens:maxTokens}}:{})};
  }
  class GeminiClient{
    constructor({fetch,getKey,getModel,TextDecoder:Decoder=globalThis.TextDecoder}){this.fetch=fetch;this.getKey=getKey;this.getModel=getModel;this.Decoder=Decoder;}
    async request(path,key,options={}){
      if(!key)throw error('请先在设置中保存 Gemini API Key。');
      let r;
      try{r=await this.fetch(ENDPOINT+path,{...options,redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json','x-goog-api-key':key,...options.headers}});}
      catch{throw error(options.signal?.aborted?'生成已停止。':'无法连接 Gemini，请检查网络。');}
      if(!r.ok){try{await r.body?.cancel();}catch{}throw statusError(r.status);}return r;
    }
    async models(signal){
      const key=this.getKey(),found=new Map();let token='';const seen=new Set();
      do{
        const query='?pageSize=100'+(token?'&pageToken='+encodeURIComponent(token):'');
        let page;try{page=await (await this.request('/models'+query,key,{signal})).json();}catch(e){throw e.safe?e:error('Gemini 返回的模型列表无法读取。');}
        for(const m of Array.isArray(page?.models)?page.models:[]){const slug=typeof m?.name==='string'&&m.name.startsWith('models/')?m.name.slice(7):'';
          if(VALID.test(slug)&&m.supportedGenerationMethods?.includes('generateContent')&&!/(?:^|-)(?:tts|image|vision|audio|live|native)(?:-|$)/i.test(slug))found.set(slug,{slug,displayName:typeof m.displayName==='string'?m.displayName:slug});}
        token=typeof page?.nextPageToken==='string'?page.nextPageToken:'';
        if(token&&(seen.has(token)||seen.size>=30))throw error('Gemini 模型列表分页异常，请重试。');
        seen.add(token);
      }while(token);
      if(!found.size)throw error('此 Gemini API Key 没有可用的对话模型。');
      return [...found.values()];
    }
    /** @param {any[]} messages @param {{signal?:AbortSignal,onDelta?:(delta:string)=>void,maxTokens?:number,thinking?:any}} options */
    async generate(messages,{signal,onDelta=()=>{},maxTokens,thinking}={}){
      let reader,partial='',finish='';
      try{
        const model=this.getModel();if(!VALID.test(model||''))throw error('请在 Gemini 设置中刷新列表并选择模型。');
        if(thinking?.type==='disabled'&&maxTokens)maxTokens=Math.max(maxTokens,8192);
        const body=JSON.stringify(requestBody(messages,maxTokens));
        const result=await this.request(`/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,this.getKey(),{method:'POST',signal,headers:{Accept:'text/event-stream'},body});
        reader=result.body?.getReader();if(!reader)throw error('Gemini 没有返回可读的回答。');
        const decoder=new this.Decoder('utf-8');let buffer='';
        const event=record=>{
          const data=record.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!data||data==='[DONE]')return;
          const parsed=JSON.parse(data);if(parsed.error)throw error('Gemini 中途停止生成，请重试。');
          if(parsed.promptFeedback?.blockReason)throw error('Gemini 拦截了这次请求，请调整问题或材料。');
          const choice=parsed.candidates?.[0];if(!choice)return;
          if(choice.finishReason&&choice.finishReason!=='FINISH_REASON_UNSPECIFIED')finish=choice.finishReason;
          for(const p of choice.content?.parts||[])if(!p.thought&&typeof p.text==='string'&&p.text){partial+=p.text;if(partial.length>1000000)throw error('Gemini 回答过长。');onDelta(p.text);}
        };
        for(;;){
          if(signal?.aborted)throw error('生成已停止。');
          const chunk=await reader.read();buffer+=chunk.done?decoder.decode():decoder.decode(chunk.value,{stream:true});
          let match;while((match=/\r?\n\r?\n/.exec(buffer))){event(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length);}
          if(buffer.length>2000000)throw error('Gemini 返回的回答异常。');
          if(chunk.done){if(buffer.trim())event(buffer);break;}
        }
        if(signal?.aborted)throw error('生成已停止。');
        if(finish==='MAX_TOKENS')throw error('Gemini 回答达到长度上限，请继续追问。');
        if(finish!=='STOP'||!partial.trim())throw error('Gemini 回答没有正常完成，请重试。');
        return partial;
      }catch(e){const failure=signal?.aborted?error('生成已停止。'):e.safe?e:error('Gemini 连接中断或返回格式异常，请重试。');failure.partial=partial;failure.incomplete=true;throw failure;}
      finally{try{await reader?.cancel();}catch{}try{reader?.releaseLock();}catch{}}
    }
    summarize(previous,messages,options){return D.DeepSeekClient.prototype.summarize.call(this,previous,messages,options);}
  }
  const api={GeminiClient,VALID};root.ZMAGemini=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
