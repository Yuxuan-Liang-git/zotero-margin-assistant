const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture,configured,source,connection}=require('./rag-fixture.cjs');
const {Index}=require('../src/library-index.js');
const {Corpus}=require('../src/rag-host.js');
const C=require('../src/core.js');
const response=inputs=>new Response(JSON.stringify({data:inputs.map((_,index)=>({index,embedding:[1,0]}))}));
const sources=n=>Array.from({length:n},(_,i)=>({...source(2,'Distinct source '+i),paperKey:'P'+String(i).padStart(7,'0'),sourceKey:'D'+String(i).padStart(7,'0'),attachmentKey:'D'+String(i).padStart(7,'0')}));

test('normal sources share a full eight-input request and the final partial batch',async t=>{
  const f=await fixture(t,{sources:sources(10)});await configured(f);
  await f.manager.settingsAPI().build();await f.manager.work;
  assert.deepEqual(f.requests.slice(1).map(batch=>batch.length),[8,2]);
  assert.equal(f.manager.state().readySources,10);
});

test('shared input hashes are sent once across source owners in a mixed batch',async t=>{
  const data=sources(9);data[0].title=data[1].title='Shared title';data[1].text=data[0].text;data[1].signature=data[0].signature;
  const f=await fixture(t,{sources:data});await configured(f);
  await f.manager.settingsAPI().build();await f.manager.work;
  assert.deepEqual(f.requests.slice(1).map(batch=>batch.length),[8]);
  assert.equal(new Set(f.requests.slice(1).flat()).size,8);
  assert.equal(f.manager.state().readySources,9);
});

test('one mutated owner prevents publishing the entire mixed batch and advancing its cursor',async t=>{
  let entered,release,documentCall=false;const ready=new Promise(r=>entered=r);
  const f=await fixture(t,{sources:sources(8),fetch:async(_url,_init,body)=>{
    if(body.input[0]==='This is a connection test.')return response(body.input);
    if(!documentCall){documentCall=true;entered();return new Promise(r=>release=()=>r(response(body.input)));}
    return response(body.input);
  }});await configured(f);await f.manager.settingsAPI().build();await ready;
  f.sources[7]={...f.sources[7],text:'Changed after request',signature:'3333333344444444',fingerprint:'5555555566666666'};
  release();await f.manager.work;
  assert.equal(f.requests[1].length,8);
  assert.equal(f.manager.state().readySegments,0);
  assert.equal((await f.store.control(f.manager.space.namespace)).cursor,'');
  assert.equal(f.manager.state().paused,true);
});

test('a mixed in-flight batch keeps cursor before uncommitted sources and resumes without duplicate successes',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zma-rag-mixed-')),file=path.join(dir,'vectors.sqlite');
  let entered,release,calls=0;const ready=new Promise(r=>entered=r);
  const f=await fixture(t,{file,sources:sources(10),fetch:async(_url,_init,body)=>{
    if(body.input[0]==='This is a connection test.')return response(body.input);
    if(++calls===2){entered();return new Promise(r=>release=()=>r(response(body.input)));}
    return response(body.input);
  }});await configured(f);await f.manager.settingsAPI().build();await ready;
  const progress=await f.store.control(f.manager.space.namespace);
  await f.manager.stop();release();await f.manager.work;
  const restarted=await fixture(t,{file,preferences:f.preferences,sources:f.sources});
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const oldReady=restarted.manager.state().readySources;
  await restarted.manager.settingsAPI().build();await restarted.manager.work;
  assert.equal(progress.cursor,'8');assert.equal(oldReady,8);
  assert.deepEqual(restarted.requests.map(batch=>batch.length),[2]);
  assert.equal(restarted.manager.state().readySources,10);
});

test('pilot cohort selects current then reading-history papers outside the first twenty and pins selection',async t=>{
  const index=new Index(connection(),1);await index.open();
  try{
    const data=sources(23);
    for(const s of data){const unit={key:'pdf-'+s.sourceKey,sourceKey:s.sourceKey,attachmentKey:s.attachmentKey,paperKey:s.paperKey,kind:'pdf',fingerprint:s.fingerprint,title:s.title,year:'2025',doi:'',libraryID:1,status:'ready'};
      await index.replacePaper({key:s.paperKey,libraryID:1,title:s.title});const gen=await index.beginUnit(unit);await index.append(unit,gen,[{text:s.text,part:0,pageIndex:42}]);await index.commitUnit(unit,gen);
    }
    const state=C.emptyState();state.conversations[0].history=[{role:'user',content:'Prior reading question'},{role:'assistant',content:'Complete reading explanation'}];
    const corpus=new Corpus({libraryID:1,papers:{index,ensure:async()=>{},adapter:{validateSource:s=>index.contains(s)}},history:{list:async()=>[{libraryID:1,attachmentKey:data[21].attachmentKey}]},readRecord:async()=>({state,metadata:{title:'Reading paper',paperKey:data[21].paperKey},summaryValid:true})});
    const output=[];for await(const entry of corpus.sources({limitPapers:20,priority:{libraryID:1,attachmentKey:data[22].attachmentKey}}))output.push(entry);
    const selected=[...new Set(output.map(entry=>entry.source.paperKey))];
    assert.deepEqual(selected,[data[22].paperKey,data[21].paperKey,...data.slice(0,18).map(s=>s.paperKey)]);
    const checkpoint=output[0].checkpoint;assert.deepEqual(JSON.parse(checkpoint).cohort,selected);
    const resumed=[];for await(const entry of corpus.sources({cursor:checkpoint,limitPapers:20,priority:{libraryID:1,paperKey:data[20].paperKey}}))resumed.push(entry);
    assert.deepEqual([...new Set(resumed.map(entry=>entry.source.paperKey))],selected);
    let entered,release;const ready=new Promise(r=>entered=r);
    const f=await fixture(t,{fetch:async(_url,_init,body)=>{
      if(body.input[0]==='This is a connection test.')return response(body.input);
      entered();return new Promise(r=>release=()=>r(response(body.input)));
    }});await configured(f);f.manager.corpus=options=>corpus.sources(options);f.manager.validate=(s,signal)=>corpus.validate(s,signal);
    f.manager.prioritize({libraryID:1,attachmentKey:data[22].attachmentKey});await f.manager.settingsAPI().pilot();await ready;
    const saved=await f.store.control(f.manager.space.namespace);await f.manager.stop();release();await f.manager.work;
    assert.deepEqual(JSON.parse(saved.cursor).cohort,selected);assert.equal(JSON.parse(saved.cursor).afterId,0);

  }finally{await index.close();}
});

for(const action of ['stop','configuration change'])test('pending connection test is cancelled by '+action+' without late persistence',async t=>{
  let entered,release,requestSignal;const ready=new Promise(r=>entered=r);
  const f=await fixture(t,{fetch:async(_url,init,body)=>{requestSignal=init.signal;entered();return new Promise(r=>release=()=>r(response(body.input)));}});
  await f.manager.settingsAPI().apply({key:'fixture-key'});
  const testing=f.manager.settingsAPI().test();const outcome=testing.then(()=>null,error=>error);
  await ready;if(action==='stop')await f.manager.stop();else await f.manager.settingsAPI().apply({model:'another-model'});
  const aborted=requestSignal.aborted;release();const error=await outcome;
  assert.equal(aborted,true);assert.ok(error);assert.equal(f.profiles.state().tested,false);
});

test('a queued test profile mutation cannot persist after shutdown',async t=>{
  const f=await fixture(t);await f.manager.settingsAPI().apply({key:'fixture-key'});
  let decrypts=0,entered,release,blocker;const ready=new Promise(r=>entered=r);
  f.profiles.adapter.decrypt=async()=>{
    if(++decrypts===2)queueMicrotask(()=>{blocker=f.profiles.credentials();});
    if(decrypts===3){entered();await new Promise(r=>release=r);}
    return 'fixture-key';
  };
  const testing=f.manager.settingsAPI().test();const outcome=testing.then(()=>null,error=>error);
  await ready;await new Promise(r=>setImmediate(r));
  await f.manager.stop();release();await blocker;const error=await outcome;
  await f.profiles._queue;
  assert.ok(error);assert.equal(f.profiles.state().tested,false);
});


test('a changed owner of a shared hash prevents all mixed-batch vector publication',async t=>{
  const data=sources(9);data[0].title=data[1].title='Shared title';data[1].text=data[0].text;data[1].signature=data[0].signature;
  let entered,release;const ready=new Promise(r=>entered=r);
  const f=await fixture(t,{sources:data,fetch:async(_url,_init,body)=>{
    if(body.input[0]==='This is a connection test.')return response(body.input);
    entered();return new Promise(r=>release=()=>r(response(body.input)));
  }});await configured(f);await f.manager.settingsAPI().build();await ready;
  f.sources[1]={...f.sources[1],text:'Changed shared owner',signature:'7777777788888888',fingerprint:'9999999900000000'};
  release();await f.manager.work;assert.equal(f.manager.state().readySegments,0);
  assert.equal((await f.store.control(f.manager.space.namespace)).cursor,'');
});

test('mutation while filling a batch is rejected before any obsolete document upload',async t=>{
  const data=sources(8);let f,mutated=false;
  f=await fixture(t,{sources:data,validate:s=>{
    if(s.sourceKey===data[7].sourceKey&&!mutated){mutated=true;data[0]={...data[0],signature:'9999999900000000',text:'New authority'};}
    return data.some(current=>current.sourceKey===s.sourceKey&&current.signature===s.signature);
  }});await configured(f);await f.manager.settingsAPI().build();await f.manager.work;
  assert.equal(f.requests.length,1);assert.equal(f.manager.state().readySegments,0);assert.equal(f.manager.state().paused,true);
});

test('configuration change cancels a queued test mutation before it can persist',async t=>{
  const f=await fixture(t);await f.manager.settingsAPI().apply({key:'fixture-key'});
  let decrypts=0,entered,release,blocker;const ready=new Promise(r=>entered=r);
  f.profiles.adapter.decrypt=async()=>{
    if(++decrypts===2)queueMicrotask(()=>{blocker=f.profiles.credentials();});
    if(decrypts===3){entered();await new Promise(r=>release=r);}
    return 'fixture-key';
  };
  const testing=f.manager.settingsAPI().test();const outcome=testing.then(()=>null,error=>error);
  await ready;await new Promise(r=>setImmediate(r));
  const change=f.manager.settingsAPI().apply({model:'changed-model'});await new Promise(r=>setImmediate(r));
  release();await blocker;await change;const error=await outcome;await f.profiles._queue;
  assert.ok(error);assert.equal(f.profiles.state().tested,false);assert.equal(f.profiles.state().model,'changed-model');
});
