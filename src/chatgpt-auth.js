(function(root){
  'use strict';
  const ISSUER='https://auth.openai.com',RESOURCE='https://api.openai.com/v1';
  const PREF='margincomments.chatgptCredentials',HOST_PREF='margincomments.chatgptHost';
  const SCOPES='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
  const safe=(message,code='auth_error')=>Object.assign(new Error(message),{safe:true,code});
  class AuthManager{
    constructor({adapter,platform=globalThis,fetch,listen,openBrowser,onChange=()=>{}}){
      this.adapter=adapter;this.platform=platform;this.fetch=fetch;this.listen=listen;this.openBrowser=openBrowser;this.onChange=onChange;this.state={version:1,hostID:'',accounts:[],activeID:null,welcomed:false};this.refreshes=new Map();this.writeQueue=Promise.resolve();this.revision=0;this.signingOut=false;
    }
    random(){return this.base64(this.platform.crypto.getRandomValues(new Uint8Array(32)));}
    base64(bytes){return this.platform.btoa(Array.from(new Uint8Array(bytes),x=>String.fromCharCode(x)).join('')).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
    bytes(value){return Uint8Array.from(this.platform.atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));}
    async load(){
      let hostID=this.adapter.get(HOST_PREF);if(!/^urn:uuid:[a-f0-9-]{36}$/.test(hostID||'')){hostID='urn:uuid:'+this.platform.crypto.randomUUID();this.adapter.set(HOST_PREF,hostID);}
      this.state.hostID=hostID;const value=this.adapter.get(PREF);if(!value)return;
      try{if(typeof value!=='string'||!value.startsWith('oskv1:'))throw Error();const saved=JSON.parse(await this.adapter.decrypt(value));
        if(saved.version!==1||saved.hostID!==hostID||!Array.isArray(saved.accounts)||saved.accounts.some(a=>!a.id||!a.clientID||a.clientID==='dynamic_agent_client'||!a.subject)||saved.activeID&&!saved.accounts.some(a=>a.id===saved.activeID))throw Error();this.state=saved;
      }catch{throw safe('已保存的 ChatGPT 登录信息无法读取，请在设置中重新登录。');}
    }
    async update(change,valid=()=>true){
      const operation=this.writeQueue.then(async()=>{if(!valid())throw safe('ChatGPT 会话已变更，请重试。');const next=change(this.state);const plain=JSON.stringify(next),cipher=await this.adapter.encrypt(plain);
        if(typeof cipher!=='string'||!cipher.startsWith('oskv1:')||cipher.includes(plain))throw safe('ChatGPT 登录信息未能安全加密，未保存。');
        if(!valid())throw safe('ChatGPT 会话已变更，请重试。');
        this.adapter.set(PREF,cipher);this.state=next;this.onChange();
      });this.writeQueue=operation.catch(()=>{});return operation;
    }
    active(){return this.state.accounts.find(a=>a.id===this.state.activeID);}
    accounts(){return this.state.accounts.map((a,i)=>({id:a.id,subject:a.subject,label:`${a.email||a.name||'ChatGPT 账户'} · ${i+1}`,signedIn:!!a.accessToken,model:a.model||'',models:a.models||[]}));}
    async select(id){if(this.signingOut||this.stopping)throw safe('ChatGPT 正在退出或关闭，请稍后重试。');if(!this.state.accounts.some(a=>a.id===id))throw safe('ChatGPT 账户不存在');this.cancelSignIn();await this.update(s=>({...s,activeID:id}));}
    async json(url,options={}){
      const Abort=this.platform.AbortController||globalThis.AbortController,controller=new Abort(),parent=options.signal,abort=()=>controller.abort();parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)controller.abort();
      const timer=setTimeout(abort,20000);
      try{const response=await this.fetch(url,{...options,signal:controller.signal,redirect:'error'});let data;try{data=await response.json();}catch{throw safe('ChatGPT 返回了无效响应，请重试。');}
        if(!response.ok){const code=typeof data.error==='string'?data.error:data.error?.code;throw safe(response.status===400&&code==='invalid_grant'?'ChatGPT 登录已过期或被撤销，请重新登录。':'ChatGPT 授权请求失败，请稍后重试。',code==='invalid_grant'?'invalid_grant':'auth_http');}return data;
      }catch(e){if(e.safe)throw e;throw safe(parent?.aborted?'ChatGPT 登录已取消。':'无法连接 ChatGPT 授权服务，请检查网络后重试。');}
      finally{clearTimeout(timer);parent?.removeEventListener('abort',abort);}
    }
    async discovery(){
      if(!this.config)this.config=this.json(ISSUER+'/.well-known/openid-configuration').then(data=>{
        if(data.issuer!==ISSUER)throw safe('ChatGPT 授权配置无效');
        for(const key of ['authorization_endpoint','token_endpoint','jwks_uri','revocation_endpoint'])if((key!=='revocation_endpoint'||data[key])&&new this.platform.URL(data[key]).origin!==ISSUER)throw safe('ChatGPT 授权配置无效');return data;
      }).catch(()=>{this.config=null;throw safe('ChatGPT 授权配置无法验证，请重试。');});return this.config;
    }
    async verifyIdentity(token,clientID,nonce=undefined){
      try{
        const parts=token.split('.');if(parts.length!==3)throw Error();const decode=value=>JSON.parse(new this.platform.TextDecoder().decode(this.bytes(value)));
        const header=decode(parts[0]),claims=decode(parts[1]),config=await this.discovery(),jwks=await this.json(config.jwks_uri);
        const jwk=jwks.keys.find(k=>k.kid===header.kid&&(!k.use||k.use==='sig')&&(!k.alg||k.alg===header.alg));let algorithm;
        if(header.alg==='RS256'&&jwk?.kty==='RSA')algorithm={name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'};
        else if(header.alg==='ES256'&&jwk?.kty==='EC'&&jwk.crv==='P-256')algorithm={name:'ECDSA',namedCurve:'P-256',hash:'SHA-256'};else throw Error();
        const key=await this.platform.crypto.subtle.importKey('jwk',jwk,algorithm,false,['verify']);
        const verificationAlgorithm=algorithm.name==='ECDSA'?{name:'ECDSA',hash:'SHA-256'}:{name:'RSASSA-PKCS1-v1_5'};
        const valid=await this.platform.crypto.subtle.verify(verificationAlgorithm,key,this.bytes(parts[2]),new this.platform.TextEncoder().encode(parts[0]+'.'+parts[1]));
        const now=Date.now()/1000,audience=Array.isArray(claims.aud)?claims.aud:[claims.aud];
        if(!valid||claims.iss!==ISSUER||!audience.includes(clientID)||typeof claims.sub!=='string'||!claims.sub||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+30||claims.nbf>now+30||nonce!==undefined&&claims.nonce!==nonce||claims.azp!==undefined&&claims.azp!==clientID||audience.length>1&&claims.azp!==clientID)throw Error();return claims;
      }catch{throw safe('ChatGPT 身份验证失败，请重新登录。');}
    }
    tokenFields(data,previous={}){
      const scopes=typeof data.scope==='string'?data.scope.split(/\s+/):previous.scopes;
      if(!scopes?.includes('chatgpt.tokens.use.direct')||!scopes.includes('resource.invoke'))throw safe('尚未允许使用 ChatGPT 订阅，请重新登录并授权。');
      if(typeof data.access_token!=='string'||!data.access_token||data.token_type?.toLowerCase()!=='bearer'||!Number.isFinite(data.expires_in)||data.expires_in<=0||!Number.isFinite(Date.now()+data.expires_in*1000)||!(data.refresh_token||previous.refreshToken))throw safe('ChatGPT 返回的登录凭据不完整，请重新登录。');
      return {accessToken:data.access_token,refreshToken:data.refresh_token||previous.refreshToken,idToken:data.id_token||previous.idToken,expiresAt:Date.now()+data.expires_in*1000,scopes};
    }
    cancelSignIn(){this.pending?.abort();}
    async signIn(id=undefined){
      if(this.pending||this.signingOut||this.stopping)throw safe('已有 ChatGPT 登录、退出或关闭正在进行，请完成或取消。');
      const Abort=this.platform.AbortController||globalThis.AbortController,controller=new Abort();this.pending=controller;const revision=this.revision,previous=id?this.state.accounts.find(a=>a.id===id):null;
      if(id&&!previous){this.pending=null;throw safe('ChatGPT 账户不存在');}
      let listener,timer,used=false;
      try{
        const state=this.random(),nonce=this.random(),verifier=this.random();const config=await this.discovery();if(controller.signal.aborted)throw safe('ChatGPT 登录已取消。');
        let resolveResult,rejectResult;const result=new Promise((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;});void result.catch(()=>{});
        controller.signal.addEventListener('abort',()=>rejectResult(safe('ChatGPT 登录已取消。')),{once:true});
        listener=await this.listen(url=>{
          const query=url.searchParams;
          if(used||controller.signal.aborted||url.pathname!=='/auth/callback')return {status:404};
          if(query.getAll('state').length!==1||query.get('state')!==state)return {status:400};used=true;
          const clientID=query.get('client_id')||previous?.clientID;
          if(query.has('error'))rejectResult(safe('ChatGPT 授权已取消或未获允许。'));
          else if(query.getAll('code').length!==1||!query.get('code')||query.getAll('client_id').length>1||!clientID||!/^[a-zA-Z0-9_-]{1,200}$/.test(clientID)||clientID==='dynamic_agent_client'||previous&&clientID!==previous.clientID)rejectResult(safe('ChatGPT 注册回调无效，请重新登录。'));
          else resolveResult({code:query.get('code'),clientID});return {status:200};
        });
        const params=new this.platform.URLSearchParams({client_id:previous?.clientID||'dynamic_agent_client',ext_agent_host_id:this.state.hostID,response_type:'code',redirect_uri:listener.redirectURI,scope:SCOPES,resource:RESOURCE,state,nonce,code_challenge_method:'S256',code_challenge:this.base64(await this.platform.crypto.subtle.digest('SHA-256',new this.platform.TextEncoder().encode(verifier)))});
        if(!previous)params.set('agent_name_hint','Zotero Margin Assistant');else if(previous.email)params.set('login_hint',previous.email);
        // Do not put retained tokens in browser URLs/process arguments.
        timer=setTimeout(()=>controller.abort(),300000);if(controller.signal.aborted)throw safe('ChatGPT 登录已取消。');
        await this.openBrowser(config.authorization_endpoint+'?'+params.toString());const callback=await result;
        const data=await this.json(config.token_endpoint,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new this.platform.URLSearchParams({grant_type:'authorization_code',client_id:callback.clientID,code:callback.code,code_verifier:verifier,redirect_uri:listener.redirectURI,resource:RESOURCE}).toString()});
        const claims=await this.verifyIdentity(data.id_token,callback.clientID,nonce),tokens=this.tokenFields(data);
        if(previous&&previous.subject!==claims.sub)throw safe('登录的 ChatGPT 账户与所选账户不一致。');
        if(controller.signal.aborted||revision!==this.revision)throw safe('ChatGPT 登录已取消。');
        const account={...(previous||{}),...tokens,id:callback.clientID+':'+claims.sub,clientID:callback.clientID,subject:claims.sub,email:typeof claims.email==='string'?claims.email:'',name:typeof claims.name==='string'?claims.name:''};
        await this.update(s=>({...s,activeID:account.id,accounts:[...s.accounts.filter(a=>a.id!==account.id),account]}),()=>!controller.signal.aborted&&revision===this.revision);return account.id;
      }catch(e){throw e.safe?e:safe('ChatGPT 登录未完成，请重试。');}
      finally{clearTimeout(timer);await listener?.close();if(this.pending===controller)this.pending=null;}
    }
    async accessToken(id=this.state.activeID,force=false){
      if(this.signingOut||this.stopping)throw safe('ChatGPT 正在退出或关闭，请稍后重新登录。');
      const account=this.state.accounts.find(a=>a.id===id);if(!account?.accessToken)throw safe('请先在设置中登录 ChatGPT。');
      if(!force&&account.expiresAt>Date.now()+60000)return account.accessToken;
      if(this.refreshes.has(id))return this.refreshes.get(id);
      const revision=this.revision,task=(async()=>{
        const config=await this.discovery(),data=await this.json(config.token_endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new this.platform.URLSearchParams({grant_type:'refresh_token',client_id:account.clientID,refresh_token:account.refreshToken,resource:RESOURCE}).toString()});
        const fields=this.tokenFields(data,account);
        if(data.id_token){const claims=await this.verifyIdentity(data.id_token,account.clientID);if(claims.sub!==account.subject)throw safe('ChatGPT 刷新后的身份不一致，请重新登录。');}
        const valid=()=>revision===this.revision&&this.state.accounts.find(a=>a.id===id)?.refreshToken===account.refreshToken;
        if(!valid())throw safe('ChatGPT 会话已变更，请重试。');
        await this.update(s=>({...s,accounts:s.accounts.map(a=>a.id===id?{...a,...fields}:a)}),valid);return fields.accessToken;
      })();this.refreshes.set(id,task);try{return await task;}finally{if(this.refreshes.get(id)===task)this.refreshes.delete(id);}
    }
    async setModels(id,models){await this.update(s=>({...s,accounts:s.accounts.map(a=>a.id===id?{...a,models,model:models.some(m=>m.slug===a.model)?a.model:models[0]?.slug||''}:a)}));}
    async setModel(model){const account=this.active();if(!account?.models?.some(m=>m.slug===model))throw safe('此模型不在当前 ChatGPT 账户列表中，请刷新列表。');await this.update(s=>({...s,accounts:s.accounts.map(a=>a.id===account.id?{...a,model}:a)}));}
    async signOut(){
      this.cancelSignIn();if(this.signingOut)throw safe('ChatGPT 正在退出。');this.signingOut=true;
      try{const id=this.state.activeID,refresh=this.refreshes.get(id);if(refresh)await refresh.catch(()=>{});const account=this.state.accounts.find(a=>a.id===id);if(!account)return '';
        let warning='';if(account.refreshToken){let revoked=false;
          for(let attempt=0;attempt<2&&!revoked;attempt++){
            const Abort=this.platform.AbortController||globalThis.AbortController,controller=new Abort(),timer=setTimeout(()=>controller.abort(),15000);
            try{const config=await this.discovery();if(!config.revocation_endpoint)throw Error();const response=await this.fetch(config.revocation_endpoint,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new this.platform.URLSearchParams({token:account.refreshToken,token_type_hint:'refresh_token',client_id:account.clientID}).toString()});revoked=response.ok;await response.body?.cancel();}catch{}finally{clearTimeout(timer);}if(!revoked&&attempt===0)await new Promise(resolve=>setTimeout(resolve,500));
          }if(!revoked)warning='已在本机退出；未能确认远程撤销，可到 ChatGPT 设置断开此应用。';
        }
        await this.update(s=>({...s,accounts:s.accounts.map(a=>a.id===account.id?{id:a.id,clientID:a.clientID,subject:a.subject,email:a.email,name:a.name,model:a.model,models:a.models}:a)}));return warning;
      }finally{this.signingOut=false;}
    }
    async stop(){this.stopping=true;this.cancelSignIn();await Promise.allSettled(this.refreshes.values());await this.writeQueue;this.revision++;}
  }
  const api={AuthManager,ISSUER,RESOURCE,PREF,HOST_PREF};root.ZMAChatGPTAuth=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
