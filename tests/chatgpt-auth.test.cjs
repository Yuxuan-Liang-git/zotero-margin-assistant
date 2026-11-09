const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {webcrypto}=require('node:crypto');
function api(){assert.ok(fs.existsSync(__dirname+'/../src/chatgpt-auth.js'),'subscription auth must be implemented');return require('../src/chatgpt-auth.js');}
const encode=value=>Buffer.from(typeof value==='string'||value instanceof Uint8Array?value:JSON.stringify(value)).toString('base64url');
async function fixture(){
  const A=api(),keys=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await webcrypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='qa';const prefs=new Map(),calls=[];let callback,opened,pending=0;
  const platform={crypto:webcrypto,URL,URLSearchParams,TextEncoder,TextDecoder,atob,btoa};
  const adapter={get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v),encrypt:async v=>'oskv1:'+Buffer.from(v).toString('base64'),decrypt:async v=>Buffer.from(v.slice(6),'base64').toString()};
  async function token(claims){const data=encode({alg:'RS256',kid:'qa'})+'.'+encode({iss:A.ISSUER,aud:'oaiapp_qa',sub:'subject',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),...claims});return data+'.'+encode(Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,Buffer.from(data))));}
  const network=async(url,options={})=>{
    calls.push({url,options});
    if(url.endsWith('openid-configuration'))return Response.json({issuer:A.ISSUER,authorization_endpoint:A.ISSUER+'/api/accounts/authorize',token_endpoint:A.ISSUER+'/api/accounts/oauth/token',jwks_uri:A.ISSUER+'/.well-known/jwks.json',revocation_endpoint:A.ISSUER+'/oauth/revoke'});
    if(url.endsWith('jwks.json'))return Response.json({keys:[jwk]});
    if(url.endsWith('/token')){pending++;await new Promise(r=>setTimeout(r,8));const grant=new URLSearchParams(options.body);return Response.json({access_token:grant.get('grant_type')==='refresh_token'?'access-rotated':'access-secret',refresh_token:'refresh-'+pending,token_type:'Bearer',expires_in:3600,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',id_token:await token({nonce:opened.searchParams.get('nonce')})});}
    if(url.endsWith('/revoke'))return new Response(null,{status:200});throw Error('unexpected request');
  };
  const options={adapter,platform,fetch:network,listen:async cb=>{callback=cb;return {redirectURI:'http://127.0.0.1:45123/auth/callback',close:async()=>{}};},openBrowser:url=>{opened=new URL(url);},onChange:()=>{}};
  const auth=new A.AuthManager(options);await auth.load();
  async function login(){const task=auth.signIn();while(!opened)await new Promise(r=>setTimeout(r,1));const invalid=await callback(new URL('http://127.0.0.1:45123/auth/callback?state=bad&code=ignored'));assert.equal(invalid.status,400);await callback(new URL('http://127.0.0.1:45123/auth/callback?'+new URLSearchParams({state:opened.searchParams.get('state'),code:'once',client_id:'oaiapp_qa'})));await task;}
  return {A,auth,options,prefs,calls,token,keys,jwk,login,get opened(){return opened;},get callback(){return callback;}};
}
test('official PKCE login validates identity and persists encrypted credentials and stable host across restart',async()=>{
  const f=await fixture();await f.login();assert.equal(f.opened.origin,'https://auth.openai.com');assert.equal(f.opened.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(f.opened.searchParams.get('code_challenge_method'),'S256');
  const exchange=f.calls.find(c=>c.url.endsWith('/token'));assert.equal(new URLSearchParams(exchange.options.body).get('redirect_uri'),'http://127.0.0.1:45123/auth/callback');
  assert.equal(await f.auth.accessToken(),'access-secret');assert.ok(!JSON.stringify([...f.prefs]).includes('access-secret'));
  const restored=new f.A.AuthManager(f.options);await restored.load();assert.equal(await restored.accessToken(),'access-secret');assert.equal(restored.state.hostID,f.auth.state.hostID);assert.equal(restored.accounts()[0].subject,'subject');
});
test('OIDC rejects tampered signatures, wrong nonce/audience, expiry and untrusted discovery URLs',async()=>{
  const f=await fixture(),auth=f.auth;
  for(const claims of [{nonce:'wrong'},{nonce:'nonce',aud:'other'},{nonce:'nonce',exp:1}])await assert.rejects(auth.verifyIdentity(await f.token(claims),'oaiapp_qa','nonce'),/身份/);
  const valid=await f.token({nonce:'nonce'}),parts=valid.split('.');parts[1]=encode({iss:f.A.ISSUER,aud:'oaiapp_qa',sub:'attacker',exp:Date.now()/1000+1000,nonce:'nonce'});
  await assert.rejects(auth.verifyIdentity(parts.join('.'),'oaiapp_qa','nonce'),/身份/);
  const bad=new f.A.AuthManager({...f.options,fetch:async()=>Response.json({issuer:f.A.ISSUER,authorization_endpoint:'https://evil.test'})});await assert.rejects(bad.discovery(),/配置/);
});
test('refreshes serialize and rotate all encrypted credentials before use',async()=>{
  const f=await fixture();await f.login();f.auth.active().expiresAt=0;const before=f.calls.filter(c=>c.url.endsWith('/token')).length;
  assert.deepEqual(await Promise.all([f.auth.accessToken(),f.auth.accessToken()]),['access-rotated','access-rotated']);assert.equal(f.calls.filter(c=>c.url.endsWith('/token')).length,before+1);
  const restored=new f.A.AuthManager(f.options);await restored.load();assert.equal(await restored.accessToken(),'access-rotated');assert.equal(restored.active().refreshToken,'refresh-2');
});
test('sign out revokes refresh session, clears local tokens and keeps account mapping and host ID',async()=>{
  const f=await fixture();await f.login();const id=f.auth.state.activeID,host=f.auth.state.hostID;await f.auth.signOut();assert.ok(f.calls.some(c=>c.url.endsWith('/revoke')));assert.equal(f.auth.active().accessToken,undefined);assert.equal(f.auth.state.activeID,id);assert.equal(f.auth.state.hostID,host);await assert.rejects(f.auth.accessToken(),/登录/);
  const restored=new f.A.AuthManager(f.options);await restored.load();assert.equal(restored.active().refreshToken,undefined);assert.equal(restored.accounts().length,1);
});
test('cancelling sign-in disposes the listener and prevents late callbacks from storing credentials',async()=>{
  const f=await fixture();const task=f.auth.signIn();while(!f.opened)await new Promise(r=>setTimeout(r,1));f.auth.cancelSignIn();await assert.rejects(task,/取消/);assert.equal(f.auth.accounts().length,0);
});

test('sign out during refresh revokes the latest rotated refresh token and never resurrects local tokens',async()=>{
  const f=await fixture();await f.login();f.auth.active().expiresAt=0;
  const refresh=f.auth.accessToken();await new Promise(r=>setTimeout(r,2));const logout=f.auth.signOut();await refresh;await logout;
  const revoke=f.calls.find(c=>c.url.endsWith('/revoke'));assert.equal(new URLSearchParams(revoke.options.body).get('token'),'refresh-2');assert.equal(f.auth.active().accessToken,undefined);
});

test('switching accounts while a model-list token refresh runs preserves the rotated token for the original account',async()=>{
  const f=await fixture();await f.login();const first=f.auth.state.activeID;f.auth.active().expiresAt=0;
  await f.auth.update(s=>({...s,accounts:[...s.accounts,{id:'second',clientID:'oaiapp_second',subject:'second-subject',accessToken:'second-access',refreshToken:'second-refresh',expiresAt:Date.now()+3600000,scopes:['resource.invoke','chatgpt.tokens.use.direct']}]}));
  const refresh=f.auth.accessToken(first);await new Promise(r=>setTimeout(r,2));await f.auth.select('second');
  assert.equal(await refresh,'access-rotated');assert.equal(f.auth.state.activeID,'second');assert.equal(f.auth.state.accounts.find(a=>a.id===first).refreshToken,'refresh-2');
});

test('normal plugin shutdown waits for refresh rotation to reach encrypted storage',async()=>{
  const f=await fixture();await f.login();f.auth.active().expiresAt=0;const refresh=f.auth.accessToken();await new Promise(r=>setTimeout(r,2));await f.auth.stop();await refresh;
  const restored=new f.A.AuthManager(f.options);await restored.load();assert.equal(restored.active().refreshToken,'refresh-2');
});

test('reasoning effort validates the selected model and survives encrypted restart',async()=>{
  const f=await fixture();await f.login();await f.auth.setModels(f.auth.state.activeID,[{slug:'qa',displayName:'QA',reasoningEfforts:['low','medium','high']}]);assert.equal(typeof f.auth.setReasoning,'function');await f.auth.setReasoning('high');
  const restored=new f.A.AuthManager(f.options);await restored.load();assert.equal(restored.active().reasoningEffort,'high');await assert.rejects(restored.setReasoning('max'),/支持/);await restored.setReasoning('default');assert.equal(restored.active().reasoningEffort,'default');
});
test('speed preference validates model support and survives encrypted restart',async()=>{
 const f=await fixture();await f.login();await f.auth.setModels(f.auth.state.activeID,[{slug:'qa',displayName:'QA',speedTiers:['default','fast']}]);
 assert.equal(typeof f.auth.setSpeed,'function');await f.auth.setSpeed('fast');const restored=new f.A.AuthManager(f.options);await restored.load();assert.equal(restored.active().speed,'fast');assert.equal(restored.accounts()[0].speed,'fast');await assert.rejects(restored.setSpeed('ultrafast'),/支持/);await restored.setSpeed('default');
});
test('changing models clears only unsupported saved speed and reasoning controls',async()=>{
 const f=await fixture();await f.login();const models=[{slug:'a',reasoningEfforts:['low','max'],speedTiers:['default','fast']},{slug:'b',reasoningEfforts:['low'],speedTiers:['default']}];
 await f.auth.setModels(f.auth.state.activeID,models);await f.auth.setReasoning('max');await f.auth.setSpeed('fast');await f.auth.setModel('b');assert.equal(f.auth.active().speed,'default');assert.equal(f.auth.active().reasoningEffort,'default');
});

test('discovery retries a transient read once, shares concurrent requests, and leaves tokens untouched',async()=>{
  const f=await fixture();await f.login();const credentials=f.prefs.get(f.A.PREF),account=f.auth.active();
  let reads=0;f.auth.config=null;f.auth.fetch=async(url,options)=>{
    if(url.endsWith('openid-configuration')&&++reads===1)throw Error('private proxy diagnostics');
    return f.options.fetch(url,options);
  };
  const [first,second]=await Promise.all([f.auth.discovery(),f.auth.discovery()]);
  assert.equal(first.issuer,f.A.ISSUER);assert.equal(first,second);assert.equal(reads,2);
  assert.equal(f.prefs.get(f.A.PREF),credentials);assert.equal(f.auth.active(),account);
});

test('discovery preserves safe failure categories, resets its cache, and never includes raw service details',async()=>{
  const f=await fixture();
  const cases=[
    {fetch:async()=>{throw Error('private network value');},code:'auth_network',message:/连接/},
    {fetch:async()=>new Response('<html>private service value</html>',{status:403}),code:'auth_http',status:403,message:/HTTP 403/},
    {fetch:async()=>Response.json({error:'private service value'},{status:503}),code:'auth_http',status:503,message:/HTTP 503/},
    {fetch:async()=>new Response('<html>private service value</html>'),code:'auth_response',message:/有效的 JSON/},
  ];
  for(const scenario of cases){
    const auth=new f.A.AuthManager({...f.options,fetch:scenario.fetch});
    await assert.rejects(auth.discovery(),error=>{
      assert.equal(error.safe,true);assert.equal(error.code,scenario.code);assert.equal(error.status,scenario.status);
      assert.match(error.message,scenario.message);assert.doesNotMatch(error.message,/private/);return true;
    });
    assert.equal(auth.config,null);auth.fetch=f.options.fetch;
    assert.equal((await auth.discovery()).issuer,f.A.ISSUER);
  }
});

test('invalid discovery fields identify the failed check and are rejected without retrying',async()=>{
  const f=await fixture(),valid=await f.auth.discovery();
  for(const [field,value] of [['issuer','https://other.invalid'],['token_endpoint',null],['jwks_uri','https://other.invalid/keys'],['authorization_endpoint','https://user:secret@auth.openai.com/login']]){
    let reads=0;const auth=new f.A.AuthManager({...f.options,fetch:async()=>{reads++;return Response.json({...valid,[field]:value});}});
    await assert.rejects(auth.discovery(),error=>error.code==='auth_config'&&error.message.includes(field)&&!error.message.includes('secret'));
    assert.equal(reads,1);
  }
});

test('token exchange errors retain invalid_grant and do not retry POST requests',async()=>{
  const f=await fixture();let posts=0;
  f.auth.fetch=async()=>{posts++;return Response.json({error:'invalid_grant'},{status:400});};
  await assert.rejects(f.auth.json(f.A.ISSUER+'/api/accounts/oauth/token',{method:'POST'}),error=>error.code==='invalid_grant'&&error.status===400);
  assert.equal(posts,1);
});
