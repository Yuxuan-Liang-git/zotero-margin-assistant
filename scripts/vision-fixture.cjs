// Synthetic mixed PDF: selectable prose with raster-only equations.
const {PDFDocument,StandardFonts}=require('pdf-lib'),{createCanvas}=require('@napi-rs/canvas'),fs=require('node:fs');
(async()=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),canvas=createCanvas(900,180),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,180);ctx.fillStyle='black';ctx.font='40px serif';ctx.fillText('e(t) = y(t) - H u(t)',25,90);ctx.fillText('(6.30)',740,90);
 const image=await pdf.embedPng(canvas.toBuffer('image/png'));
 for(let i=0;i<2;i++){const page=pdf.addPage([600,800]);page.drawText(i?'Formula (6.30) defines the prediction error.':'Mixed PDF abstract: parameter estimation.',{x:35,y:735,size:13,font});page.drawImage(image,{x:35,y:450,width:530,height:106});}
 fs.writeFileSync(process.argv[2],await pdf.save());
})().catch(e=>{console.error(e);process.exitCode=1;});
