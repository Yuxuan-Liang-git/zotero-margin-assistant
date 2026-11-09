const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
function api(){assert.ok(fs.existsSync(__dirname+'/../src/web.js'),'web search metadata module must exist');return require('../src/web.js');}
test('web metadata keeps cited sources and image provenance while rejecting active and private URLs',()=>{
 const W=api(),value=W.clean({used:true,citations:[{url:'https://paper.example/a',title:'Paper',start:4,end:6},{url:'javascript:alert(1)',title:'bad'}],sources:[{url:'https://ref.example/intro',title:'Background'}],images:[{url:'https://cdn.example/figure.png',source:'https://ref.example/figure',caption:'Illustration'},{url:'https://127.0.0.1/private',source:'https://ref.example/a'}]});assert.equal(value.citations.length,1);assert.equal(value.images.length,1);for(const url of ['file:///x','data:image/png;base64,YQ==','https://localhost/x','https://192.168.1.2/x','https://[::1]/','https://user:pass@x.example/a'])assert.equal(W.safeURL(url),'');assert.equal(value.images[0].source,'https://ref.example/figure');
});
test('inline web citations preserve prose, math and repeated source numbering',()=>{
 const W=api(),text='定义成立。推导为 \\(x=1\\)。',meta={used:true,citations:[{url:'https://a.example/p',title:'Paper',start:0,end:5},{url:'https://a.example/p',title:'Paper',start:5,end:text.length}]};const formatted=W.citedText(text,meta);assert.ok(formatted.includes('定义成立。'));assert.ok(formatted.includes('\\(x=1\\)'));assert.equal((formatted.match(/\[1\]/g)||[]).length,2);assert.ok(!formatted.includes('[2]'));const state=require('../src/core.js').emptyState();state.conversations[0].history=[{role:'assistant',content:text,materials:[],web:meta}];assert.equal(require('../src/core.js').cleanState(state).conversations[0].history[0].web.citations.length,2);
});
test('several URLs sharing one citation marker all remain clickable',()=>{
 const W=api(),text='结论。citesource1source2',start=3,end=Array.from(text).length,formatted=W.citedText(text,{citations:[{url:'https://a.example/1',start,end},{url:'https://b.example/2',start,end}]});assert.match(formatted,/\[1\]\(<https:\/\/a.example\/1>\)/);assert.match(formatted,/\[2\]\(<https:\/\/b.example\/2>\)/);assert.ok(!formatted.includes('cite'));assert.ok(formatted.startsWith('结论。'));
});
test('citation offsets count Unicode code points and move out of an inline formula',()=>{
 const W=api(),text='🙂 推导为 \\(x=1\\)。',end=Array.from(text).indexOf('1')+1,formatted=W.citedText(text,{citations:[{url:'https://a.example/1',start:0,end}]});assert.equal(formatted,'🙂 推导为 \\(x=1\\)[1](<https://a.example/1>)。');
});
