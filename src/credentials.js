(function(root){
  'use strict';
  const KEY_PREF='margincomments.deepseekKey';
  const MODEL_PREF='margincomments.deepseekModel';
  const DEFAULT_MODEL='deepseek-flash';
  class CredentialStore{
    constructor(adapter,{keyPref=KEY_PREF,modelPref=MODEL_PREF,defaultModel=DEFAULT_MODEL,label='DeepSeek'}={}){this.adapter=adapter;this.keyPref=keyPref;this.modelPref=modelPref;this.defaultModel=defaultModel;this.label=label;}
    async load(){
      const stored=this.adapter.get(this.keyPref);
      const selected=this.adapter.get(this.modelPref);
      const model=typeof selected==='string'&&/^[a-z0-9._-]{1,64}$/i.test(selected)?selected:this.defaultModel;
      if(!stored)return {key:'',model};
      if(typeof stored!=='string'||!stored.startsWith('oskv1:'))throw new Error(`已保存的 ${this.label} 密钥格式无效，请清除后重新设置`);
      return {key:await this.adapter.decrypt(stored),model};
    }
    async save(key,model){
      const normalized=String(model||'').trim();
      if(!/^[a-z0-9._-]{1,64}$/i.test(normalized)&&(normalized||this.defaultModel))throw new Error('模型名称无效');
      const plain=String(key||'').trim();
      let encrypted;
      if(plain){
        encrypted=await this.adapter.encrypt(plain);
        if(typeof encrypted!=='string'||!encrypted.startsWith('oskv1:')||encrypted.includes(plain))throw new Error('密钥未能安全加密，设置未保存');
      }
      if(encrypted)this.adapter.set(this.keyPref,encrypted);
      this.adapter.set(this.modelPref,normalized);
    }
    async clear(){this.adapter.clear(this.keyPref);}
  }
  const api={CredentialStore,KEY_PREF,MODEL_PREF,DEFAULT_MODEL};
  root.ZMACredentials=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
