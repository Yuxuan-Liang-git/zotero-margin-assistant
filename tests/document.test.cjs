const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {PDFDocument,StandardFonts}=require('pdf-lib');
const M=fs.existsSync(__dirname+'/../src/document.js')?require('../src/document.js'):{};
test('automatic context reads the actual PDF including pages not currently displayed',async()=>{
  assert.equal(typeof M.extract,'function');const fixture=await PDFDocument.create(),font=await fixture.embedFont(StandardFonts.Helvetica);
  for(const text of ['PMSM identification abstract: unbiased parameter estimation.','Conclusion: sampling noise excitation cancels estimation bias.'])fixture.addPage([600,800]).drawText(text,{x:30,y:700,size:12,font});
  const pdfjs=await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href),task=pdfjs.getDocument({data:new Uint8Array(await fixture.save()),useSystemFonts:true});
  try{const index=await M.extract(await task.promise);const context=M.choose(index,'What does this paper explain?',0,4000);assert.equal(context.mode,'full-text');assert.deepEqual(context.pages,[1,2]);assert.match(context.text,/sampling noise excitation cancels/);assert.match(context.text,/PDF 第 2 页/);}finally{await task.destroy();}
});
test('long documents select relevant unseen passages and disclose excerpt coverage',()=>{
  assert.equal(typeof M.choose,'function');const index={totalPages:20,pages:Array.from({length:20},(_,i)=>({pageIndex:i,text:('Ordinary unrelated text. '.repeat(180))+(i===12?' Formula (6.30) defines inductance using flux data.':'')}))};
  const context=M.choose(index,'Explain formula (6.30) and inductance',0,6000);assert.equal(context.mode,'excerpts');assert.ok(context.pages.includes(13));assert.match(context.text,/Formula \(6.30\) defines inductance/);assert.ok(context.text.length<=6000);assert.ok(context.pages.length<20);
});
test('Gecko wrappers are released before extracting text and failed pages remain explicit',async()=>{
  assert.equal(typeof M.extract,'function');const pdf={numPages:3,getPage:async n=>{if(n===2)throw new Error('unreadable page');return {raw:{getTextContent:async()=>({raw:{items:n===1?[{str:'ABSTRACT',hasEOL:true},{str:'test paper'}]:[]}})}};}};
  const index=await M.extract(pdf,{unwrap:v=>v?.raw||v});assert.equal(index.pages[0].text,'ABSTRACT\ntest paper');const context=M.choose(index,'summary',0,3000);assert.equal(context.mode,'excerpts');assert.deepEqual(context.failedPages,[2]);assert.deepEqual(context.scannedPages,[3]);
});
test('a scan with no text layer requests an automatic current-page image',async()=>{
  assert.equal(typeof M.extract,'function');const index=await M.extract({numPages:2,getPage:async()=>({getTextContent:async()=>({items:[]})})});const context=M.choose(index,'summary',1,3000);assert.equal(context.mode,'current-page-image');assert.deepEqual(context.pages,[2]);assert.equal(context.text,'');
});
