(function(root){
  'use strict';
  function safeURL(value,image=false){
    if(typeof value!=='string'||value.length>4096)return '';
    try{const Parser=root.URL||root.Zotero?.getMainWindow?.().URL||globalThis.URL,u=new Parser(value),host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
      if(!(image?u.protocol==='https:':['https:','http:'].includes(u.protocol))||u.username||u.password||!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))return '';
      if(host.includes(':')&&(host==='::'||host==='::1'||/^(?:fc|fd|fe[89ab])/i.test(host)||host.includes('ffff:')))return '';
      if(/^\d+\.\d+\.\d+\.\d+$/.test(host)){const [a,b]=host.split('.').map(Number);if(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a>=224||a===100&&b>=64&&b<=127)return '';}
      return u.href;
    }catch{return '';}
  }
  function clean(value){
    const citations=[],sources=[],images=[],seen=new Set();
    for(const c of Array.isArray(value?.citations)?value.citations.slice(0,100):[]){const url=safeURL(c?.url);if(!url)continue;const start=Number.isSafeInteger(c.start)&&c.start>=0?c.start:0,end=Number.isSafeInteger(c.end)&&c.end>=start?c.end:start,key=JSON.stringify([url,start,end]);if(seen.has(key))continue;seen.add(key);citations.push({url,title:String(c.title||url).slice(0,300),start,end});if(citations.length===40)break;}
    seen.clear();for(const s of Array.isArray(value?.sources)?value.sources.slice(0,100):[]){const url=safeURL(s?.url);if(!url||seen.has(url))continue;seen.add(url);sources.push({url,title:String(s.title||url).slice(0,300)});if(sources.length===20)break;}
    seen.clear();for(const i of Array.isArray(value?.images)?value.images.slice(0,30):[]){const url=safeURL(i?.url,true),source=safeURL(i?.source);if(!url||!source||seen.has(url))continue;seen.add(url);const thumbnail=safeURL(i.thumbnail,true);images.push({url,source,caption:String(i.caption||'网络配图').slice(0,600),...(thumbnail?{thumbnail}:{})});if(images.length===3)break;}
    return {used:!!value?.used,citations,sources,images};
  }
  function citedSources(web){const result=[];for(const c of clean(web).citations)if(!result.some(s=>s.url===c.url))result.push({url:c.url,title:c.title});return result;}
  function citedText(text,web){
    text=String(text);const data=clean(web),sources=citedSources(data),edits=[];
    const points=/[\uD800-\uDBFF]/.test(text)?Array.from(text):null,toOffset=n=>points?points.slice(0,n).join('').length:Math.min(n,text.length);
    const math=[...text.matchAll(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$/g)].map(m=>({start:m.index,end:m.index+m[0].length}));
    for(const c of data.citations){let start=toOffset(c.start),end=toOffset(c.end);const matched=text.slice(start,end),marker=/^\s*(?:cite[^]*|【[^】]{1,120}】)\s*$/.test(matched);if(!marker)start=end;const inside=math.find(m=>start>m.start&&start<m.end);if(inside)start=end=inside.end;const label=sources.findIndex(s=>s.url===c.url)+1,url=c.url.replace(/[()<>\s]/g,ch=>encodeURIComponent(ch));const link=`[${label}](<${url}>)`,same=edits.find(e=>e.start===start&&e.end===end);if(same)same.text+=' '+link;else edits.push({start,end,text:link});}
    edits.sort((a,b)=>b.start-a.start||b.end-a.end);let boundary=text.length;for(const e of edits){if(e.end>boundary)continue;text=text.slice(0,e.start)+e.text+text.slice(e.end);boundary=e.start;}return text;
  }
  function collect(state,event,base=0){
    const cite=c=>{if(c?.type==='url_citation')state.citations.push({url:c.url||c.url_citation?.url,title:c.title||c.url_citation?.title,start:base+(c.start_index??c.url_citation?.start_index??0),end:base+(c.end_index??c.url_citation?.end_index??0)});};
    const item=event.item||event;
    if(String(event.type).startsWith('response.web_search_call.')||item.type==='web_search_call')state.used=true;
    if(event.type==='response.output_text.annotation.added'){cite(event.annotation);state.used=true;}
    if(item.type==='message')for(const part of item.content||[]){for(const c of part.annotations||[])cite(c);if(part.type==='output_text')base+=Array.from(part.text||'').length;}
    if(item.type==='web_search_call'){
      for(const s of item.action?.sources||[])state.sources.push({url:s.url,title:s.title});
      for(const r of item.results||[]){if(r.type==='image_result')state.images.push({url:r.image_url,source:r.source_website_url,thumbnail:r.thumbnail_url,caption:r.caption});else if(r.url)state.sources.push({url:r.url,title:r.title});}
    }
    if(event.type==='response.completed'){let offset=0;for(const output of event.response?.output||[]){collect(state,output,offset);if(output.type==='message')offset+=(output.content||[]).reduce((n,c)=>n+Array.from(c.text||'').length,0);}}
    Object.assign(state,clean(state));return state;
  }
  const api={safeURL,clean,citedText,citedSources,collect};root.ZMAWeb=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
