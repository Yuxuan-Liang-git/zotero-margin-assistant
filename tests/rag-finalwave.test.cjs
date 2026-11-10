const {test}=require('node:test');const assert=require('node:assert/strict');
const{fixture,configured,source}=require('./rag-fixture.cjs');const V=require('../src/vector-core.js');
const scope={libraryID:1,attachmentKey:'PDF00001',paperKey:'PAPER001'};
const raw='这个条件何时成立';
const query=(title='Passivity paper',topic='recent damping theme')=>raw+'\n'+title+'\n'+topic;
async function ready(t,options){const f=await fixture(t,options);await configured(f);await f.manager.settingsAPI().build();await f.manager.work;f.manager.fingerprint=async()=> 'current-pdf-v1';return f;}
test('semantic POST retains raw question and expanded title/theme inside UTF8 budget',async t=>{
 const f=await ready(t);await f.manager.settingsAPI().apply({maxInputBytes:120});
 await f.manager.retrieve(scope,query()+'\n'+'😀'.repeat(100),{question:raw});const input=f.requests.at(-1)[0];
 assert.ok(input.includes(raw)&&input.includes('Passivity paper')&&input.includes('recent damping theme'));
 assert.ok(Buffer.byteLength(input)<=120&&!input.includes('\ufffd'));
 const before=f.requests.length;assert.deepEqual(await f.manager.retrieve(scope,'这篇论文讲了啥？\nPassivity damping',{question:'这篇论文讲了啥？'}),[]);assert.equal(f.requests.length,before);
});
test('RRF agreement sums best separate channel contributions and counts channel duplicates once',()=>{
 const a=source(2,'Dense only'),b=source(3,'Supported in both channels');
 assert.equal(V.hybridSelect([{source:a,denseRank:1},{source:b,denseRank:2},{source:b,sparseRank:1}],'topic',{maxPapers:1})[0].sourceKey,'PDF00003');
 assert.equal(V.hybridSelect([{source:a,denseRank:1},...Array.from({length:8},()=>({source:b,denseRank:2}))],'topic',{maxPapers:1})[0].sourceKey,'PDF00002');
});
test('continuing completed dirty full scan schedules fresh work and reuses successful vectors',async t=>{
 const f=await ready(t);await f.manager.settingsAPI().pause();const before=f.requests.length;f.sources.push(source(3,'New committed source'));f.manager.refresh();
 await f.manager.settingsAPI().pause();await f.manager.work;
 assert.equal(f.manager.state().readySources,2);assert.equal(f.manager.state().status,'ready');assert.equal(f.manager.state().refreshPending,false);assert.equal(f.requests.length,before+1);
});
test('continue without prior pilot or full authorization cannot upload any corpus',async t=>{
 const f=await fixture(t);await configured(f);await f.manager.settingsAPI().pause();await f.manager.work;assert.equal(f.requests.length,1);
});
test('query vectors reuse identical full input but changed context fingerprint and configuration cannot reuse',async t=>{
 const f=await ready(t);let fingerprint='v1';f.manager.fingerprint=async()=>fingerprint;const before=f.requests.length;
 await f.manager.retrieve(scope,query(),{question:raw});await f.manager.retrieve(scope,query(),{question:raw});assert.equal(f.requests.length,before+1);
 await f.manager.retrieve(scope,query('Changed title'),{question:raw});await f.manager.retrieve(scope,query('Changed title','new theme'),{question:raw});assert.equal(f.requests.length,before+3);
 fingerprint='v2';await f.manager.retrieve(scope,query('Changed title','new theme'),{question:raw});assert.equal(f.requests.length,before+4);
 await f.manager.settingsAPI().apply({rpm:21});await f.manager.retrieve(scope,query('Changed title','new theme'),{question:raw});assert.equal(f.requests.length,before+5);
 await f.manager.settingsAPI().apply({model:'other-model'});await f.manager.settingsAPI().test();await f.manager.settingsAPI().build();await f.manager.work;
 const afterModel=f.requests.length;await f.manager.retrieve(scope,query('Changed title','new theme'),{question:raw});assert.equal(f.requests.length,afterModel+1);
});
test('query vector cache is bounded to32 entries and expires after60 seconds without raw source/key bytes',async t=>{
 const f=await ready(t);let clock=100000;f.manager.now=()=>clock;
 for(let i=0;i<40;i++)await f.manager.retrieve(scope,query('Title '+i),{question:raw});
 assert.equal(f.manager.queryVectors.size,32);assert.ok([...f.manager.queryVectors.keys()].every(key=>/^[a-f0-9]{64}$/.test(key)));
 assert.ok([...f.manager.queryVectors.values()].every(entry=>Object.keys(entry).sort().join(',')==='expiresAt,vector'));
 const before=f.requests.length;await f.manager.retrieve(scope,query('Title 39'),{question:raw});assert.equal(f.requests.length,before);
 clock+=60001;await f.manager.retrieve(scope,query('Title 39'),{question:raw});assert.equal(f.requests.length,before+1);
});
test('failed and aborted semantic requests do not populate query cache',async t=>{
 let mode='normal',entered,release;const enteredPromise=new Promise(r=>entered=r);
 const f=await ready(t,{fetch:async(_url,_init,body)=>{if(mode==='fail')throw Error('offline');if(mode==='hold'){entered();return new Promise(r=>release=()=>r(new Response(JSON.stringify({data:body.input.map((_,index)=>({index,embedding:[1,0]}))}))));}return new Response(JSON.stringify({data:body.input.map((_,index)=>({index,embedding:[1,0]}))}));}});
 mode='fail';await f.manager.retrieve(scope,query(),{question:raw});mode='normal';const before=f.requests.length;await f.manager.retrieve(scope,query(),{question:raw});await f.manager.retrieve(scope,query(),{question:raw});assert.equal(f.requests.length,before+1);
 mode='hold';const controller=new AbortController(),pending=f.manager.retrieve(scope,query('Abort title'),{question:raw,signal:controller.signal});await enteredPromise;controller.abort();await pending;release();mode='normal';const after=f.requests.length;
 await f.manager.retrieve(scope,query('Abort title'),{question:raw});assert.equal(f.requests.length,after+1);
});
