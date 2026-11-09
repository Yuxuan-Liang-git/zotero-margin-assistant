const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const R=fs.existsSync(__dirname+'/../src/capture.js')?require('../src/capture.js'):{};
test('PDF page promises unwrapped at the Gecko boundary expose viewport and render methods',async()=>{
  const rawPage={rotate:0,getViewport:()=>({width:100,height:100,convertToViewportPoint:(x,y)=>[x,y]}),render:()=>({promise:Promise.resolve()}),getTextContent:async()=>({items:[]})};
  const wrappedPage={raw:rawPage};
  const result=await R.captureRegion({getPage:async()=>wrappedPage},{pageIndex:0,rects:[[10,20,30,40]],pageLabel:'1'},{createElement:()=>({getContext:()=>({}),toDataURL:()=> 'data:image/png;base64,YQ=='})},{unwrap:o=>o.raw||o});
  assert.equal(result.width,20);assert.equal(result.height,20);
});
test('rotation and clipping use PDF viewport transformed corners',()=>{
  assert.equal(typeof R.cropBounds,'function');
  const viewport={width:200,height:100,convertToViewportPoint:(x,y)=>[y,100-x]};
  assert.deepEqual(R.cropBounds([[10,20,40,60]],viewport),{x:20,y:60,width:40,height:30});
  assert.deepEqual(R.cropBounds([[-20,-10,20,30]],viewport),{x:0,y:80,width:30,height:20});
  assert.throws(()=>R.cropBounds([[400,400,500,500]],viewport),/页面外/);
});
test('supplementary text never includes a full line extending beyond the selected area',async()=>{
  const page={rotate:0,getViewport:()=>({width:200,height:100,convertToViewportPoint:(x,y)=>[x,100-y]}),render:()=>({promise:Promise.resolve()}),getTextContent:async()=>({items:[{str:'inside word and OUTSIDE content',transform:[10,0,0,10,20,40],width:160,height:10}]})};
  const m=await R.captureRegion({getPage:async()=>page},{pageIndex:0,rects:[[10,20,50,50]],pageLabel:'1'},{createElement:()=>({getContext:()=>({}),toDataURL:()=> 'data:image/png;base64,YQ=='})});assert.equal(m.text,'');
});
test('offscreen crop renders source page with translated PDF coordinates and filters text',async()=>{
  assert.equal(typeof R.captureRegion,'function');
  let options;const page={rotate:0,getViewport:({scale})=>({width:200*scale,height:100*scale,convertToViewportPoint:(x,y)=>[x*scale,(100-y)*scale]}),render:o=>{options=o;return {promise:Promise.resolve()};},getTextContent:async()=>({items:[{str:'selected',transform:[1,0,0,1,20,40],width:30,height:8},{str:'outside',transform:[1,0,0,1,180,90],width:10,height:8}]})};
  const canvas={getContext:()=>({}),toDataURL:()=> 'data:image/png;base64,YQ=='};
  let requested;const m=await R.captureRegion({getPage:async n=>{requested=n;return page;}},{pageIndex:8,rects:[[10,20,50,50]],pageLabel:'3'},{createElement:()=>canvas});
  assert.equal(requested,9);assert.equal(m.width,80);assert.equal(m.height,60);
  assert.deepEqual(options.transform,[1,0,0,1,-20,-100]);assert.equal(m.text,'selected');
});
