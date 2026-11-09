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
  async function captureRegion(pdfDocument,source,document,{unwrap=value=>value}={}){
    const page=unwrap(await unwrap(pdfDocument).getPage(source.pageIndex+1));
    if(typeof page.getViewport!=='function')throw new Error('无法读取 PDF 页面渲染接口，请重新打开 PDF');
    let viewport=unwrap(page.getViewport({scale:2,rotation:page.rotate}));
    let box=cropBounds(source.rects,viewport);
    // Render only the crop at readable resolution; bound canvas memory for full pages.
    const maxDimension=2400;
    if(Math.max(box.width,box.height)>maxDimension){viewport=unwrap(page.getViewport({scale:2*maxDimension/Math.max(box.width,box.height),rotation:page.rotate}));box=cropBounds(source.rects,viewport);}
    const canvas=document.createElement('canvas');canvas.width=box.width;canvas.height=box.height;
    await unwrap(page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[1,0,0,1,-box.x,-box.y],background:'rgb(255,255,255)'})).promise;
    const dataURL=canvas.toDataURL('image/png');canvas.width=1;canvas.height=1;
    let text='';
    try{
      const content=unwrap(await page.getTextContent());
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
  async function captureNativeRegion(renderer,source,document,{cloneInto=(value,_target)=>value}={}){
    const rect=[Math.min(...source.rects.map(r=>Math.min(r[0],r[2]))),Math.min(...source.rects.map(r=>Math.min(r[1],r[3]))),Math.max(...source.rects.map(r=>Math.max(r[0],r[2]))),Math.max(...source.rects.map(r=>Math.max(r[1],r[3])))];
    const images=await renderer.renderRegionCrops(source.pageIndex,cloneInto([rect],renderer));
    let dataURL=images?.[0];if(!/^data:image\/png;base64,/.test(dataURL||''))throw new Error('区域截图为空，请重新框选');
    const image=document.createElement('img');await new Promise((resolve,reject)=>{image.onload=()=>resolve(undefined);image.onerror=()=>reject(new Error('区域截图无法解码'));image.src=dataURL;});
    let width=image.naturalWidth,height=image.naturalHeight;
    if(Math.max(width,height)>2400){const ratio=2400/Math.max(width,height),canvas=document.createElement('canvas');width=canvas.width=Math.max(1,Math.round(width*ratio));height=canvas.height=Math.max(1,Math.round(height*ratio));canvas.getContext('2d').drawImage(image,0,0,width,height);dataURL=canvas.toDataURL('image/png');canvas.width=canvas.height=1;}
    image.removeAttribute('src');
    return {source:{...source},dataURL,text:'',width,height};
  }
  const api={cropBounds,captureRegion,captureNativeRegion};root.ZMACapture=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
