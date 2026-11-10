(function(root){
  'use strict';
  /** @typedef {{endpoint:string,model:string,cipher:string,enabled:boolean,tested:boolean,dimensions:number|null,maxInputBytes:number,batchSize:number,rpm:number,requestedDimensions?:number}} Profile */
  const PREF='margincomments.embeddingProfiles';
  const DEFAULT_ENDPOINT='https://api.siliconflow.cn/v1/embeddings';
  const DEFAULT_MODEL='BAAI/bge-m3';
  function failure(){return Object.assign(new Error('云端向量配置或加密凭据无效，请重新设置'),{name:'EmbeddingConfigurationError'});}
  function canonicalEndpoint(value){
    if(typeof value!=='string')throw failure();
    const text=value.trim();if(!/^https:\/\//i.test(text)||/[\x00-\x20\x7f\\]/.test(text)||text.includes('#'))throw failure();
    let url;try{url=new URL(text);}catch{throw failure();}
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw failure();
    url.searchParams.forEach((_,key)=>{if(/key|token|secret|password|credential|auth|signature/i.test(key))throw failure();});
    return url.href;
  }
  function modelID(value){if(typeof value!=='string'||!/^[a-z0-9][a-z0-9._/-]{0,255}$/i.test(value))throw failure();return value;}
  function dimension(value){if(!Number.isInteger(value)||value<1||value>4096)throw failure();return value;}
  function integer(value,max){if(!Number.isInteger(value)||value<1||value>max)throw failure();return value;}
  /** @returns {Profile} */
  function fresh(endpoint){return {endpoint,model:DEFAULT_MODEL,cipher:'',enabled:false,tested:false,dimensions:null,maxInputBytes:8000,batchSize:8,rpm:20};}
  function checked(value){
    if(!value||typeof value!=='object')throw failure();const endpoint=canonicalEndpoint(value.endpoint);
    /** @type {Profile} */
    const result={endpoint,model:modelID(value.model),cipher:value.cipher,enabled:value.enabled,tested:value.tested,dimensions:value.dimensions,maxInputBytes:integer(value.maxInputBytes,1024*1024),batchSize:integer(value.batchSize,128),rpm:integer(value.rpm,600)};
    if(typeof result.cipher!=='string'||result.cipher&&!result.cipher.startsWith('oskv1:')||typeof result.enabled!=='boolean'||typeof result.tested!=='boolean')throw failure();
    if(value.requestedDimensions!==undefined&&value.requestedDimensions!==null)result.requestedDimensions=dimension(value.requestedDimensions);
    if(result.tested){dimension(result.dimensions);if(!result.cipher||result.requestedDimensions&&result.dimensions!==result.requestedDimensions)throw failure();}
    else if(result.dimensions!==null)throw failure();
    return result;
  }
  class Profiles{
    constructor(adapter){this.adapter=adapter;this._profiles=new Map([[DEFAULT_ENDPOINT,fresh(DEFAULT_ENDPOINT)]]);this._endpoint=DEFAULT_ENDPOINT;this._revision=0;this._loaded=false;this._queue=Promise.resolve();}
    _serial(work){const result=this._queue.then(work);this._queue=result.catch(()=>{});return result;}
    async _load(){
      if(this._loaded)return;
      try{
        const raw=await this.adapter.get(PREF);
        if(raw){
          if(typeof raw!=='string')throw failure();const data=JSON.parse(raw);
          if(data.version!==1||!Array.isArray(data.profiles)||!Number.isSafeInteger(data.revision)||data.revision<0)throw failure();
          const endpoint=canonicalEndpoint(data.endpoint),profiles=new Map();
          for(const value of data.profiles){const profile=checked(value);if(profiles.has(profile.endpoint))throw failure();profiles.set(profile.endpoint,profile);}
          if(!profiles.has(endpoint))throw failure();this._profiles=profiles;this._endpoint=endpoint;this._revision=data.revision;
        }
        this._loaded=true;
      }catch{throw failure();}
    }
    load(){return this._serial(async()=>{await this._load();return this.state();});}
    state(endpoint=this._endpoint){
      endpoint=canonicalEndpoint(endpoint);const p=this._profiles.get(endpoint)||fresh(endpoint);
      return {endpoint:p.endpoint,model:p.model,hasKey:!!p.cipher,enabled:p.enabled,tested:p.tested,dimensions:p.dimensions,maxInputBytes:p.maxInputBytes,batchSize:p.batchSize,rpm:p.rpm,revision:this._revision};
    }
    async _save(profiles,endpoint){
      if(this._revision>=Number.MAX_SAFE_INTEGER)throw failure();const revision=this._revision+1;
      try{await this.adapter.set(PREF,JSON.stringify({version:1,endpoint,revision,profiles:[...profiles.values()]}));}catch{throw failure();}
      this._profiles=profiles;this._endpoint=endpoint;this._revision=revision;return this.state();
    }
    apply(values){return this._serial(async()=>{
      await this._load();if(!values||typeof values!=='object')throw failure();
      const endpoint=values.endpoint===undefined?this._endpoint:canonicalEndpoint(values.endpoint),old=this._profiles.get(endpoint)||fresh(endpoint),p={...old};
      if(values.model!==undefined)p.model=modelID(values.model);
      if(values.maxInputBytes!==undefined)p.maxInputBytes=integer(values.maxInputBytes,1024*1024);
      if(values.batchSize!==undefined)p.batchSize=integer(values.batchSize,128);
      if(values.rpm!==undefined)p.rpm=integer(values.rpm,600);
      if(values.requestedDimensions!==undefined){if(values.requestedDimensions===null)delete p.requestedDimensions;else p.requestedDimensions=dimension(values.requestedDimensions);}
      let changedKey=false;
      if(values.key!==undefined){
        if(typeof values.key!=='string'||values.key.length>4096||/[\x00-\x1f\x7f]/.test(values.key))throw failure();const key=values.key.trim();if(/[\x00-\x20\x7f]/.test(key))throw failure();
        if(key){try{const encrypted=await this.adapter.encrypt(key);if(typeof encrypted!=='string'||!encrypted.startsWith('oskv1:')||encrypted.includes(key))throw failure();p.cipher=encrypted;changedKey=true;}catch{throw failure();}}
      }
      if(changedKey||p.model!==old.model||p.requestedDimensions!==old.requestedDimensions){p.tested=false;p.dimensions=null;}
      if(endpoint===this._endpoint&&JSON.stringify(p)===JSON.stringify(old))return this.state();
      const profiles=new Map(this._profiles);profiles.set(endpoint,p);return this._save(profiles,endpoint);
    });}
    credentials(){return this._serial(async()=>{
      await this._load();const p=this._profiles.get(this._endpoint);let key='';
      if(p.cipher){try{key=await this.adapter.decrypt(p.cipher);if(typeof key!=='string'||!key.trim()||key.length>4096||/[\x00-\x20\x7f]/.test(key))throw failure();}catch{throw failure();}}
      return {...this.state(),key,...(p.requestedDimensions?{requestedDimensions:p.requestedDimensions}:{})};
    });}
    setEnabled(enabled){return this._serial(async()=>{
      await this._load();if(typeof enabled!=='boolean')throw failure();const old=this._profiles.get(this._endpoint);if(old.enabled===enabled)return this.state();
      const profiles=new Map(this._profiles);profiles.set(this._endpoint,{...old,enabled});return this._save(profiles,this._endpoint);
    });}
    markTested(dimensions,actualModel,expectedRevision){return this._serial(async()=>{
      await this._load();if(expectedRevision!==undefined&&expectedRevision!==this._revision)throw failure();dimension(dimensions);const p=this._profiles.get(this._endpoint);
      if(!p.cipher||p.requestedDimensions&&p.requestedDimensions!==dimensions||actualModel!==undefined&&actualModel!==p.model&&!(p.model===DEFAULT_MODEL&&actualModel==='bge-m3'))throw failure();
      const profiles=new Map(this._profiles);profiles.set(this._endpoint,{...p,tested:true,dimensions});return this._save(profiles,this._endpoint);
    });}
    clearKey(){return this._serial(async()=>{
      await this._load();const p=this._profiles.get(this._endpoint);if(!p.cipher&&!p.enabled&&!p.tested)return this.state();
      const profiles=new Map(this._profiles);profiles.set(this._endpoint,{...p,cipher:'',enabled:false,tested:false,dimensions:null});return this._save(profiles,this._endpoint);
    });}
    space(){return this._serial(async()=>{
      await this._load();const p=this._profiles.get(this._endpoint);if(!p.tested)return null;
      let namespace;try{namespace=await this.adapter.digest(JSON.stringify(['embedding-space-v1',p.endpoint,p.model,p.requestedDimensions||null,p.dimensions,'float32']));}catch{throw failure();}
      if(typeof namespace!=='string'||!/^[a-f0-9]{64}$/.test(namespace))throw failure();return {namespace,endpoint:p.endpoint,model:p.model,dimensions:p.dimensions};
    });}
  }
  const api={canonicalEndpoint,Profiles};root.ZMAEmbeddingProfiles=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
