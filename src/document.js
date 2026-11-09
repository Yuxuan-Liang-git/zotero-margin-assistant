(function(root){
  'use strict';
  /** @param {any} pdf @param {{unwrap?:(value:any)=>any,signal?:AbortSignal,onProgress?:(n:number,total:number)=>void}} options */
  async function extract(pdf,{unwrap=v=>v,signal,onProgress=(_n,_total)=>{}}={}){
    pdf=unwrap(pdf);const totalPages=Number(pdf.numPages),pages=[];let characters=0;
    if(!Number.isSafeInteger(totalPages)||totalPages<1)throw new Error('当前 PDF 还未加载完成');
    for(let i=0;i<totalPages;i++){
      if(signal?.aborted)throw new Error('文档读取已停止');
      if(characters>4000000){pages.push({pageIndex:i,text:'',error:'文档较大，此页未建立文字索引'});continue;}
      try{
        const page=unwrap(await pdf.getPage(i+1)),content=unwrap(await page.getTextContent());let text='';
        for(const item of content.items||[])if(typeof item.str==='string')text+=item.str+(item.hasEOL?'\n':' ');
        text=text.trim();pages.push({pageIndex:i,text});characters+=text.length;
      }catch(e){if(signal?.aborted)throw new Error('文档读取已停止');pages.push({pageIndex:i,text:'',error:'本页文字读取失败'});}
      onProgress(i+1,totalPages);
    }
    return {totalPages,pages};
  }
  function termsFor(question){
    const words=String(question).normalize('NFKC').toLowerCase().match(/[a-z0-9_.]{2,}|[\u4e00-\u9fff]{2,}/g)||[],terms=new Set(words.filter(w=>!['this','that','the','and','what','explain','paper','formula','pdf','page'].includes(w)));
    for(const w of words)if(/[\u4e00-\u9fff]/.test(w))for(let i=0;i<w.length-1;i++)terms.add(w.slice(i,i+2));return terms;
  }
  function imagePages(index,question,currentPage){
    const selected=[],add=page=>{if(Number.isSafeInteger(page)&&page>=1&&page<=index.totalPages&&!selected.includes(page)&&selected.length<3)selected.push(page);};add(currentPage+1);
    for(const match of String(question).matchAll(/(?:第\s*(\d+)\s*页|\bpages?\s*(\d+)\b)/gi))add(Number(match[1]||match[2]));
    const terms=termsFor(question),ranked=index.pages.map(p=>{const text=p.text.toLowerCase();let score=0;for(const term of terms)if(text.includes(term))score+=/\d/.test(term)?10:1;return {page:p.pageIndex+1,score};}).filter(p=>p.score>0).sort((a,b)=>b.score-a.score||a.page-b.page);for(const p of ranked)add(p.page);
    if(index.totalPages<=3)for(let page=1;page<=index.totalPages;page++)add(page);
    else if(!index.pages.find(p=>p.pageIndex===currentPage)?.text){add(currentPage+2);add(currentPage);}
    return selected;
  }
  function choose(index,question,currentPage,budget=48000){
    const failedPages=index.pages.filter(p=>p.error).map(p=>p.pageIndex+1),scannedPages=index.pages.filter(p=>!p.text&&!p.error).map(p=>p.pageIndex+1);
    const available=index.pages.filter(p=>p.text);
    // Even a successful text layer can omit raster equations or corrupt math glyphs.
    const base={totalPages:index.totalPages,failedPages,scannedPages,needsImage:true,imagePages:imagePages(index,question,currentPage)};
    if(!available.length)return {...base,mode:'current-page-image',text:'',pages:[currentPage+1]};
    if(budget<800)throw new Error('对话历史过长，无法加入当前 PDF，请开始新会话');
    const header=p=>`\n[PDF 第 ${p.pageIndex+1} 页]\n`,full=available.map(p=>header(p)+p.text).join('\n');
    if(full.length<=budget&&!failedPages.length&&!scannedPages.length)return {...base,mode:'full-text',text:full,pages:available.map(p=>p.pageIndex+1)};
    const words=String(question).normalize('NFKC').toLowerCase().match(/[a-z0-9_.]{2,}|[\u4e00-\u9fff]{2,}/g)||[],terms=new Set(words);
    for(const w of words)if(/[\u4e00-\u9fff]/.test(w))for(let i=0;i<w.length-1;i++)terms.add(w.slice(i,i+2));
    const chunks=[],size=Math.min(2400,Math.floor(budget/2)-80);
    for(const p of available)for(let at=0;at<p.text.length;at+=size-120){const text=p.text.slice(at,at+size),lower=text.toLowerCase();let score=(p.pageIndex===0?3:0)+(p.pageIndex===currentPage?2:0)+(p.pageIndex===index.totalPages-1?1:0);if(/abstract|conclusion|摘要|结论/.test(lower))score+=3;for(const term of terms)if(lower.includes(term))score+=10;chunks.push({...p,text,at,score});}
    chunks.sort((a,b)=>b.score-a.score||a.pageIndex-b.pageIndex||a.at-b.at);
    const selected=[];let used=0;for(const c of chunks){const length=header(c).length+c.text.length+2;if(used+length<=budget){selected.push(c);used+=length;}}
    selected.sort((a,b)=>a.pageIndex-b.pageIndex||a.at-b.at);
    return {...base,mode:'excerpts',text:selected.map(p=>header(p)+p.text).join('\n'),pages:[...new Set(selected.map(p=>p.pageIndex+1))]};
  }
  root.ZMADocument={extract,choose};if(typeof module!=='undefined')module.exports=root.ZMADocument;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
