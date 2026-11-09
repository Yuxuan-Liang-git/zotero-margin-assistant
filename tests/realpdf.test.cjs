const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');
const {PDFDocument,rgb,degrees}=require('pdf-lib');const {createCanvas,loadImage}=require('@napi-rs/canvas');const R=require('../src/capture.js');
test('real PDF.js renders offscreen and rotated crops at expected pixel positions',async()=>{
  const pdf=await PDFDocument.create();const first=pdf.addPage([200,100]);first.drawRectangle({x:10,y:20,width:40,height:30,color:rgb(0,0,1)});
  const second=pdf.addPage([200,100]);second.setRotation(degrees(90));second.drawRectangle({x:10,y:20,width:40,height:30,color:rgb(1,0,0)});
  const pdfjs=await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const task=pdfjs.getDocument({data:new Uint8Array(await pdf.save()),disableFontFace:true});const document=await task.promise;
  try{for(const [pageIndex,expected,width,height]of [[0,[0,0,255],80,60],[1,[255,0,0],60,80]]){
    const m=await R.captureRegion(document,{pageIndex,rects:[[10,20,50,50]],pageLabel:'book-page'},{createElement:()=>createCanvas(1,1)});
    assert.equal(m.width,width);assert.equal(m.height,height);const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');ctx.drawImage(await loadImage(m.dataURL),0,0);
    assert.deepEqual([...ctx.getImageData(Math.floor(width/2),Math.floor(height/2),1,1).data].slice(0,3),expected);
  }}finally{await task.destroy();}
});
