const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Client}=require('../src/embedding-client.js');
const endpoint='https://api.siliconflow.cn/v1/embeddings';
const config=()=>({endpoint,model:'BAAI/bge-m3',key:'public-example-key',hasKey:true,enabled:true,tested:true,dimensions:2,maxInputBytes:8000,batchSize:8,rpm:20,revision:1});
const payload=(data=[{index:0,embedding:[1,2]}],model='BAAI/bge-m3')=>({model,data,usage:{prompt_tokens:2,total_tokens:2}});
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers});
function fixture(response=()=>json(payload())){let current=config(),calls=[];const client=new Client({credentials:async()=>({...current}),fetch:async(url,options)=>{calls.push({url,options});return response(url,options);}});return {client,calls,change:values=>Object.assign(current,values)};}
test('real POST construction uses exact endpoint, float arrays and bearer key without unsupported dimensions',async()=>{
 const {client,calls}=fixture(()=>json(payload([{index:1,embedding:[3,4]},{index:0,embedding:[1,2]}],'bge-m3')));const result=await client.embed(['public sentence one','public sentence two']);
 assert.deepEqual(result,{vectors:[[1,2],[3,4]],dimensions:2,model:'bge-m3',usage:{prompt_tokens:2,total_tokens:2}});assert.equal(calls[0].url,endpoint);assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers.Authorization,'Bearer public-example-key');assert.deepEqual(JSON.parse(calls[0].options.body),{model:'BAAI/bge-m3',input:['public sentence one','public sentence two'],encoding_format:'float'});
});
test('explicit requested dimensions are sent and explicit retest can detect changed dimensions',async()=>{
 const {client,calls,change}=fixture(()=>json(payload([{index:0,embedding:[1,2,3]}])));await assert.rejects(client.embed(['public text']),{name:'EmbeddingResponseError'});const detected=await client.embed(['public fixed test'],{expectedDimensions:null});assert.equal(detected.dimensions,3);
 change({requestedDimensions:3});await client.embed(['public text'],{expectedDimensions:3});assert.equal(JSON.parse(calls.at(-1).options.body).dimensions,3);
});
test('invalid batch and UTF-8 input bounds reject before network',async()=>{
 const {client,calls,change}=fixture();for(const input of [[],Array(9).fill('a'),[''],[null],['a'.repeat(8001)],['中'.repeat(2667)]])await assert.rejects(client.embed(input),{name:'EmbeddingConfigurationError'});assert.equal(calls.length,0);
 change({key:''});await assert.rejects(client.embed(['public fixed test']));assert.equal(calls.length,0);
});
test('malformed vectors and nonexact index coverage are rejected as a whole batch',async()=>{
 for(const data of [[{index:0,embedding:[0,0]}],[{index:0,embedding:[1,Infinity]}],[{index:0,embedding:[1,null]}],[{index:0,embedding:[1]}],[{index:1,embedding:[1,2]}],[{index:0.5,embedding:[1,2]}],[],[{index:0,embedding:[1,2]},{index:0,embedding:[3,4]}]]){
   const {client}=fixture(()=>json(payload(data)));await assert.rejects(client.embed(['public fixed test']),{name:'EmbeddingResponseError'});
 }
 const unequal=fixture(()=>json(payload([{index:0,embedding:[1,2]},{index:1,embedding:[1,2,3]}])));await assert.rejects(unequal.client.embed(['one','two']));
 const nan=fixture(()=>new Response('{"model":"BAAI/bge-m3","data":[{"index":0,"embedding":[NaN,2]}]}'));await assert.rejects(nan.client.embed(['public test']));
});
test('oversized dimensions and unverified model aliases are rejected, absent model uses configured identity',async()=>{
 const tooLarge=fixture(()=>json(payload([{index:0,embedding:Array(4097).fill(1)}])));await assert.rejects(tooLarge.client.embed(['public fixed test'],{expectedDimensions:null}));
 for(const model of ['Pro/BAAI/bge-m3','other/model','BGE-M3']){const {client}=fixture(()=>json(payload(undefined,model)));await assert.rejects(client.embed(['public fixed test']));}
 const {client}=fixture(()=>json({data:[{index:0,embedding:[1,2]}]}));assert.equal((await client.embed(['public fixed test'])).model,'BAAI/bge-m3');
});
test('authentication and limit failures have typed safe metadata, obey Retry-After and never retry or echo server data',async()=>{
 for(const [status,retryable] of [[401,false],[403,false],[402,false],[400,false],[429,true],[503,true]]){const {client,calls}=fixture(()=>json({error:{message:'public-example-key public document'}},status,{'Retry-After':'2'}));await assert.rejects(client.embed(['public document']),e=>e.name==='EmbeddingHTTPError'&&e.status===status&&e.retryable===retryable&&e.retryAfter===2000&&!JSON.stringify(e).includes('public-example-key')&&!e.message.includes('public document'));assert.equal(calls.length,1);}
});
test('configuration changes while a response is in flight cannot publish vectors',async()=>{
 let release;const wait=new Promise(r=>release=r);const {client,change}=fixture(async()=>{await wait;return json(payload());});const pending=client.embed(['public fixed test']);await new Promise(r=>setImmediate(r));change({revision:2});release();await assert.rejects(pending,{name:'EmbeddingConfigurationError'});
});
test('external cancellation and timeout cover uncooperative fetch and hanging streamed body',async()=>{
 for(const hangingBody of [false,true]){
  const client=new Client({credentials:async()=>config(),fetch:async()=>hangingBody?new Response(new ReadableStream({start(){}})):new Promise(()=>{}),timeoutMs:20});
  await assert.rejects(client.embed(['public fixed test']),{name:'TimeoutError'});
  const abort=new AbortController(),pending=client.embed(['public fixed test'],{signal:abort.signal,timeoutMs:2000});abort.abort();await assert.rejects(pending,{name:'AbortError'});
 }
});
test('response byte ceiling, malformed JSON and redirect responses fail safely',async()=>{
 for(const response of [()=>new Response('x'.repeat(8*1024*1024+1)),()=>new Response('{bad'),()=>new Response('',{status:302,headers:{Location:'https://other.example'}}),()=>new Response('small',{headers:{'Content-Length':String(8*1024*1024+1)}})]){const {client}=fixture(response);await assert.rejects(client.embed(['public fixed test']),e=>!e.message.includes('public-example-key'));}
});
test('network and credential failures cannot leak keys through error messages or causes',async()=>{
 const {client}=fixture(()=>{throw Error('public-example-key Authorization: public document');});await assert.rejects(client.embed(['public document']),e=>e.name==='EmbeddingNetworkError'&&e.retryable&&!String(e.stack).includes('public-example-key')&&!('cause'in e));
 const broken=new Client({credentials:async()=>{throw Error('public-example-key');},fetch:async()=>{throw Error('unreachable');}});await assert.rejects(broken.embed(['public test']),e=>!e.message.includes('public-example-key'));
});
test('timed-out late responses cancel their bodies without consuming document output',async()=>{
 let release,cancelled=false,pulls=0;const delayed=new Promise(r=>release=r);
 const response=new Response(new ReadableStream({pull(){pulls++;},cancel(){cancelled=true;}}));
 const client=new Client({credentials:async()=>config(),fetch:async()=>{await delayed;return response;},timeoutMs:10});
 await assert.rejects(client.embed(['public fixed test']),{name:'TimeoutError'});const before=pulls;release();await new Promise(r=>setTimeout(r,10));assert.equal(cancelled,true);assert.equal(pulls,before);
});
test('malformed UTF-8 responses report response failure rather than retryable network failure',async()=>{
 const {client}=fixture(()=>new Response(new Uint8Array([0xc3,0x28])));await assert.rejects(client.embed(['public fixed test']),e=>e.name==='EmbeddingResponseError'&&!e.retryable);
});
