(function(root){
  'use strict';
  const P=root.ZMAEmbeddingProfiles||(typeof require!=='undefined'?require('./embedding-profiles.js'):null);
  const RESPONSE_LIMIT=8*1024*1024;
  class SafeError extends Error{
    constructor(name,message,status=0,retryable=false,retryAfter=null){super(message);this.name=name;this.status=status;this.retryable=retryable;this.retryAfter=retryAfter;}
  }
  const invalid=()=>new SafeError('EmbeddingConfigurationError','云端向量配置或输入无效，请检查设置');
  const malformed=()=>new SafeError('EmbeddingResponseError','云端向量响应无效，请重新测试连接');
  const aborted=()=>new SafeError('AbortError','云端向量请求已取消');
  function dimension(value){return Number.isInteger(value)&&value>=1&&value<=4096;}
  function retryAfter(value){
    if(!value)return null;const seconds=/^\d+(?:\.\d+)?$/.test(value)?Number(value)*1000:Date.parse(value)-Date.now();
    return Number.isFinite(seconds)?Math.max(0,Math.min(3600000,Math.ceil(seconds))):null;
  }
  function cancel(stream){try{const pending=stream?.cancel();pending?.catch(()=>{});}catch{}}
  function snapshot(c){return JSON.stringify([c.endpoint,c.model,c.key,c.dimensions??null,c.requestedDimensions??null,c.revision??null,c.enabled??null,c.tested??null,c.maxInputBytes,c.batchSize,c.rpm]);}
  function configuration(c){
    try{
      if(!c||P.canonicalEndpoint(c.endpoint)!==c.endpoint||typeof c.model!=='string'||!/^[a-z0-9][a-z0-9._/-]{0,255}$/i.test(c.model)||typeof c.key!=='string'||!c.key||c.key.length>4096||/[\x00-\x20\x7f]/.test(c.key))throw invalid();
      if(!Number.isInteger(c.maxInputBytes)||c.maxInputBytes<1||c.maxInputBytes>1024*1024||!Number.isInteger(c.batchSize)||c.batchSize<1||c.batchSize>128||!Number.isInteger(c.rpm)||c.rpm<1||c.rpm>600)throw invalid();
      if(c.dimensions!==null&&c.dimensions!==undefined&&!dimension(c.dimensions)||c.requestedDimensions!==undefined&&c.requestedDimensions!==null&&!dimension(c.requestedDimensions))throw invalid();
      return {...c};
    }catch{throw invalid();}
  }
  class Client{
    /** @param {{fetch:any,credentials:()=>Promise<any>,controller?:()=>AbortController,timeoutMs?:number}} options */
    constructor({fetch,credentials,controller=()=>new AbortController(),timeoutMs=30000}){this.fetch=fetch;this.credentials=credentials;this.controller=controller;this.timeoutMs=timeoutMs;}
    /** @param {string[]} inputs @param {{signal?:AbortSignal,timeoutMs?:number,expectedDimensions?:number|null}} options */
    async embed(inputs,{signal,timeoutMs=this.timeoutMs,expectedDimensions}={}){
      if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>3600000)throw invalid();
      let control;try{control=this.controller();}catch{throw invalid();}
      /** @type {ReadableStreamDefaultReader<Uint8Array>|undefined} */
      let reader;
      let responseBody,timer,onAbort;const stop=new Promise((_,reject)=>{
        onAbort=()=>{control.abort();reject(aborted());};
        if(signal?.aborted)onAbort();else signal?.addEventListener('abort',onAbort,{once:true});
        timer=setTimeout(()=>{control.abort();reject(new SafeError('TimeoutError','云端向量请求超时',0,true));},timeoutMs);
      });
      const work=async()=>{
        if(signal?.aborted)throw aborted();
        let config;try{config=configuration(await this.credentials());}catch{throw invalid();}
        const version=snapshot(config),bytes=new TextEncoder();
        if(!Array.isArray(inputs)||!inputs.length||inputs.length>config.batchSize||inputs.some(s=>typeof s!=='string'||!s.trim()||bytes.encode(s).byteLength>config.maxInputBytes))throw invalid();
        const input=inputs.slice(),body={model:config.model,input,encoding_format:'float'};
        if(config.requestedDimensions)body.dimensions=config.requestedDimensions;
        const expected=expectedDimensions===null?null:expectedDimensions===undefined?config.dimensions:expectedDimensions;
        if(expected!==null&&expected!==undefined&&!dimension(expected))throw invalid();
        if(control.signal.aborted)throw aborted();
        const serialized=JSON.stringify(body);if(bytes.encode(serialized).byteLength>RESPONSE_LIMIT)throw invalid();
        const response=await this.fetch(config.endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.key}`},body:serialized,signal:control.signal});
        if(control.signal.aborted){cancel(response.body);throw aborted();}
        responseBody=response.body;
        if(response.redirected)throw malformed();
        if(!response.ok)throw new SafeError('EmbeddingHTTPError',response.status===401||response.status===403?'云端向量认证失败，请检查密钥及权限':response.status===429?'云端向量服务限流，请稍后重试':'云端向量服务拒绝请求或暂不可用',response.status,response.status===429||response.status>=500,retryAfter(response.headers?.get('Retry-After')));
        const length=response.headers?.get('Content-Length');if(length&&(!/^\d+$/.test(length)||Number(length)>RESPONSE_LIMIT))throw malformed();
        if(!response.body?.getReader)throw malformed();reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let text='',total=0;
        while(true){
          const chunk=await reader.read();if(control.signal.aborted)throw aborted();if(chunk.done){try{text+=decoder.decode();}catch{throw malformed();}break;}
          if(!(chunk.value instanceof Uint8Array))throw malformed();total+=chunk.value.byteLength;if(total>RESPONSE_LIMIT)throw malformed();try{text+=decoder.decode(chunk.value,{stream:true});}catch{throw malformed();}
        }
        let data;try{data=JSON.parse(text);}catch{throw malformed();}
        if(!data||!Array.isArray(data.data)||data.data.length!==input.length||data.error)throw malformed();
        const model=data.model===undefined?config.model:data.model;
        if(model!==config.model&&!(config.model==='BAAI/bge-m3'&&model==='bge-m3'))throw malformed();
        const vectors=new Array(input.length);let dimensions=0;
        for(const item of data.data){
          if(!item||!Number.isInteger(item.index)||item.index<0||item.index>=input.length||vectors[item.index]!==undefined||!Array.isArray(item.embedding)||!dimension(item.embedding.length))throw malformed();
          const vector=item.embedding;if(!vector.every(n=>typeof n==='number'&&Number.isFinite(n))||!vector.some(n=>n!==0))throw malformed();
          if(!dimensions)dimensions=vector.length;
          if(vector.length!==dimensions||expected!==null&&expected!==undefined&&dimensions!==expected||config.requestedDimensions&&dimensions!==config.requestedDimensions)throw malformed();vectors[item.index]=vector.slice();
        }
        let latest;try{latest=configuration(await this.credentials());}catch{throw invalid();}
        if(version!==snapshot(latest))throw invalid();if(control.signal.aborted)throw aborted();
        const result={vectors,dimensions,model};
        if(data.usage&&typeof data.usage==='object'&&!Array.isArray(data.usage)){
          const usage={};for(const key of ['prompt_tokens','total_tokens'])if(Number.isSafeInteger(data.usage[key])&&data.usage[key]>=0)usage[key]=data.usage[key];
          if(Object.keys(usage).length)result.usage=usage;
        }
        return result;
      };
      try{return await Promise.race([work(),stop]);}
      catch(error){if(error instanceof SafeError)throw error;throw new SafeError('EmbeddingNetworkError','云端向量连接中断或响应无效，请稍后重试',0,true);}
      finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);cancel(reader||responseBody);try{reader?.releaseLock();}catch{}control.abort();}
    }
  }
  const api={Client};root.ZMAEmbeddingClient=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
