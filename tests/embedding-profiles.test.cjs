const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {Profiles,canonicalEndpoint}=require('../src/embedding-profiles.js');
const A='https://api.siliconflow.cn/v1/embeddings',B='https://other.example/v1/embeddings';
function fixture(){
  const prefs=new Map();
  const adapter={get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v),digest:async s=>createHash('sha256').update(s).digest('hex'),encrypt:async s=>'oskv1:'+Buffer.from(s).toString('base64'),decrypt:async s=>Buffer.from(s.slice(6),'base64').toString()};
  return {prefs,adapter,profiles:new Profiles(adapter)};
}
test('new profiles require explicit configuration and test; constructors perform no IO',async()=>{
  let calls=0;new Profiles({get(){calls++;}});assert.equal(calls,0);
  const {profiles}=fixture();await profiles.load();
  assert.deepEqual(profiles.state(),{endpoint:A,model:'BAAI/bge-m3',hasKey:false,enabled:false,tested:false,dimensions:null,maxInputBytes:8000,batchSize:8,rpm:20,revision:0});
  assert.equal(await profiles.space(),null);
});
test('switching to an unsaved endpoint with blank key never transfers A key, returning restores A',async()=>{
  const {profiles}=fixture();await profiles.apply({key:'public-example-A',model:'provider/model-A',maxInputBytes:4096});await profiles.markTested(3);await profiles.setEnabled(true);
  await profiles.apply({endpoint:B,key:''});assert.equal((await profiles.credentials()).key,'');assert.equal(profiles.state().tested,false);assert.equal(profiles.state().enabled,false);
  await profiles.apply({endpoint:A,key:''});const restored=await profiles.credentials();assert.equal(restored.key,'public-example-A');assert.equal(restored.model,'provider/model-A');assert.equal(restored.maxInputBytes,4096);assert.equal(restored.tested,true);assert.equal(restored.enabled,true);
});
test('restart persists only encrypted endpoint keys and safe states never expose key material',async()=>{
  const {profiles,prefs,adapter}=fixture();await profiles.apply({key:'public-example-A'});await profiles.markTested(2,'bge-m3');await profiles.setEnabled(true);
  const saved=String(prefs.get('margincomments.embeddingProfiles'));assert.ok(saved.includes('oskv1:'));assert.ok(!saved.includes('public-example-A'));assert.deepEqual([...prefs.keys()],['margincomments.embeddingProfiles']);
  const restarted=new Profiles(adapter);await restarted.load();assert.equal((await restarted.credentials()).key,'public-example-A');assert.equal(restarted.state().tested,true);assert.ok(!JSON.stringify(restarted.state()).includes('oskv1:'));assert.ok(!JSON.stringify(restarted.state()).includes('public-example-A'));
  assert.deepEqual(await restarted.space(),await profiles.space());assert.match((await profiles.space()).namespace,/^[a-f0-9]{64}$/);
});
test('clear affects current endpoint only, invalidates its test and preserves another endpoint',async()=>{
  const {profiles}=fixture();await profiles.apply({key:'public-example-A'});await profiles.apply({endpoint:B,key:'public-example-B'});await profiles.markTested(2);await profiles.clearKey();
  assert.equal((await profiles.credentials()).key,'');assert.equal(profiles.state().tested,false);assert.equal(await profiles.space(),null);
  await profiles.apply({endpoint:A});assert.equal((await profiles.credentials()).key,'public-example-A');
});
test('changed model, key and requested dimension policy invalidate tested space and revision',async()=>{
  const {profiles}=fixture();await profiles.apply({key:'public-example-A'});await profiles.markTested(3);const first=await profiles.space(),revision=profiles.state().revision;
  await profiles.apply({model:'org/other-model'});assert.equal(profiles.state().tested,false);assert.equal(await profiles.space(),null);assert.ok(profiles.state().revision>revision);
  await profiles.markTested(3);assert.notEqual((await profiles.space()).namespace,first.namespace);
  await profiles.apply({key:'public-example-B'});assert.equal(profiles.state().tested,false);
  await profiles.markTested(3);await profiles.apply({requestedDimensions:2});assert.equal(profiles.state().tested,false);await assert.rejects(profiles.markTested(3));await profiles.markTested(2);assert.equal((await profiles.credentials()).requestedDimensions,2);
});
test('serialized asynchronous saves cannot lose another endpoint or publish before persistence',async()=>{
  const {adapter,profiles}=fixture();const old=adapter.set;let release,entered;const ready=new Promise(r=>entered=r);let writes=0;
  adapter.set=async(k,v)=>{if(++writes===1){entered();await new Promise(r=>release=r);}old(k,v);};
  const one=profiles.apply({key:'public-example-A'});await ready;assert.equal(profiles.state().hasKey,false);const two=profiles.apply({endpoint:B,key:'public-example-B'});release();await Promise.all([one,two]);
  assert.equal(profiles.state().endpoint,B);await profiles.apply({endpoint:A});assert.equal((await profiles.credentials()).key,'public-example-A');
});
test('failed encryption leaves active state intact and queue remains usable',async()=>{
  const {adapter,profiles}=fixture();await profiles.apply({key:'public-example-A'});const before=profiles.state();const encrypt=adapter.encrypt;adapter.encrypt=async()=>{throw Error('public-example-B');};
  await assert.rejects(profiles.apply({endpoint:B,key:'public-example-B'}),e=>!e.message.includes('public-example-B'));assert.deepEqual(profiles.state(),before);adapter.encrypt=encrypt;await profiles.apply({endpoint:B,key:'public-example-B'});assert.equal(profiles.state().endpoint,B);
});
test('decrypt failures and plaintext stored credentials fail closed without echoing OS errors',async()=>{
  const {adapter,profiles}=fixture();await profiles.apply({key:'public-example-A'});adapter.decrypt=async()=>{throw Error('public-example-A os failure');};await assert.rejects(profiles.credentials(),e=>!e.message.includes('public-example-A'));
  const broken=fixture();broken.adapter.encrypt=async()=> 'public-example-A';await assert.rejects(broken.profiles.apply({key:'public-example-A'}));assert.equal(broken.profiles.state().hasKey,false);
});
test('endpoint normalization preserves full noncredential endpoint identity',()=>{
  assert.equal(canonicalEndpoint(' HTTPS://EXAMPLE.com:443/v1/embeddings?region=cn '),'https://example.com/v1/embeddings?region=cn');
  assert.notEqual(canonicalEndpoint(A+'?region=cn'),canonicalEndpoint(A+'?region=us'));
  for(const endpoint of ['http://example.com/v1','not a url','https://u:p@example.com/v1','https://example.com/v1#x','https://example.com/v1#','https://example.com/v1?api_key=public-example-A','https://example.com/v1?accessToken=public-example-A'])assert.throws(()=>canonicalEndpoint(endpoint));
});
test('invalid model, limits, dimensions and mismatched actual model cannot be committed',async()=>{
  const {profiles}=fixture();await profiles.load();for(const values of [{model:'bad model'},{batchSize:0},{rpm:-1},{maxInputBytes:0},{requestedDimensions:4097}])await assert.rejects(profiles.apply(values));
  await profiles.apply({key:'public-example-A'});for(const dimensions of [0,4097,1.5,NaN])await assert.rejects(profiles.markTested(dimensions));await assert.rejects(profiles.markTested(2,'Pro/BAAI/bge-m3'));assert.equal(profiles.state().tested,false);
});
test('ambiguous endpoint syntax and whitespace inside keys are rejected before encrypted persistence',async()=>{
 for(const value of ['https:example.com/v1','https://example.com\\v1'])assert.throws(()=>canonicalEndpoint(value));
 const {profiles}=fixture();await assert.rejects(profiles.apply({key:'public example key'}));assert.equal(profiles.state().hasKey,false);
});
test('connection tests cannot mark a different queued configuration as tested',async()=>{
 const {profiles}=fixture();await profiles.apply({key:'public-example-A'});const revision=profiles.state().revision;
 const changed=profiles.apply({endpoint:B,key:'public-example-B'}),tested=profiles.markTested(2,undefined,revision);
 await changed;await assert.rejects(tested);assert.equal(profiles.state().endpoint,B);assert.equal(profiles.state().tested,false);
 await profiles.markTested(2,undefined,profiles.state().revision);assert.equal(profiles.state().tested,true);
});

test('advanced similarity threshold persists per endpoint and rejects invalid values',async()=>{const{profiles,adapter}=fixture();await profiles.apply({threshold:0.62});assert.equal(profiles.state().threshold,0.62);await profiles.apply({endpoint:B});assert.equal(profiles.state().threshold,undefined);await profiles.apply({endpoint:A});const restored=new Profiles(adapter);await restored.load();assert.equal(restored.state().threshold,0.62);await assert.rejects(profiles.apply({threshold:1.1}));});
