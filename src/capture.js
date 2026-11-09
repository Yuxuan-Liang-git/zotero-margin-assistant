(function(root){
  'use strict';
  function cropBounds(rects,viewport){
    const points=rects.flatMap(r=>[[r[0],r[1]],[r[2],r[3]]]).map(p=>viewport.convertToViewportPoint(...p));
    if(!points.length||points.flat().some(n=>!Number.isFinite(n)))throw new Error('区域坐标无效');
    const x=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0]))));
    const y=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1]))));
    const right=Math.min(Math.ceil(viewport.width),Math.ceil(Math.max(...points.map(p=>p[0]))));
    const bottom=Math.min(Math.ceil(viewport.height),Math.ceil(Math.max(...points.map(p=>p[1]))));
    if(right<=x||bottom<=y)throw new Error('区域位于页面外，请重新框选');
    return {x,y,width:right-x,height:bottom-y};
  }
  async function captureRegion(pdfDocument,source,document){
    const page=await pdfDocument.getPage(source.pageIndex+1);
    let viewport=page.getViewport({scale:2,rotation:page.rotate});
    let box=cropBounds(source.rects,viewport);
    // Render only the crop at readable resolution; bound canvas memory for full pages.
    const maxDimension=2400;
    if(Math.max(box.width,box.height)>maxDimension){viewport=page.getViewport({scale:2*maxDimension/Math.max(box.width,box.height),rotation:page.rotate});box=cropBounds(source.rects,viewport);}
    const canvas=document.createElement('canvas');canvas.width=box.width;canvas.height=box.height;
    await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[1,0,0,1,-box.x,-box.y],background:'rgb(255,255,255)'}).promise;
    const dataURL=canvas.toDataURL('image/png');canvas.width=1;canvas.height=1;
    let text='';
    try{
      const content=await page.getTextContent();
      text=content.items.filter(item=>{
        if(!item.transform||typeof item.str!=='string')return false;
        const [a,b,c,d,x,y]=item.transform;const length=Math.hypot(a,b),height=Number(item.height)||Math.hypot(c,d),width=Number(item.width);
        if(!(length>0)||!(height>0)||!Number.isFinite(width)||width<0)return false;
        const upLength=Math.hypot(c,d);if(!upLength)return false;
        const along=[a/length*width,b/length*width],up=[c/upLength*height,d/upLength*height];
        // Keep only complete line boxes, including conservative descent; never send a cut line.
        const points=[[x-up[0]*.3,y-up[1]*.3],[x+up[0],y+up[1]],[x+along[0]-up[0]*.3,y+along[1]-up[1]*.3],[x+along[0]+up[0],y+along[1]+up[1]]];
        return source.rects.some(r=>points.every(([px,py])=>px>=Math.min(r[0],r[2])&&px<=Math.max(r[0],r[2])&&py>=Math.min(r[1],r[3])&&py<=Math.max(r[1],r[3])));
      }).map(item=>item.str).join(' ').slice(0,16000);
    }catch{/* Scanned documents work without a text layer. */}
    return {source:{...source},dataURL,text,width:box.width,height:box.height};
  }
  const api={cropBounds,captureRegion};root.ZMACapture=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
