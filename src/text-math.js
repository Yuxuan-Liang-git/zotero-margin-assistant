(function(root){
  'use strict';
  const selector='.customAnnotationLayer textarea.textAnnotation[data-id]';
  class TextMath{
    constructor(host,doc){
      this.host=host;this.doc=doc;this.entries=new Map();this.layers=new Map();this.composing=new WeakSet();this.closed=false;this.queued=false;this.listeners=[];
      const field=target=>target?.matches?.(selector)?target:null;
      this.listen('focusin',event=>{const input=field(event.target);if(input){const entry=this.entries.get(input);if(entry)entry.view.hidden=true;this.ink(input,false);}});
      this.listen('focusout',event=>{if(field(event.target))this.queue();});this.listen('input',event=>{if(field(event.target))this.queue();});
      this.listen('compositionstart',event=>{const input=field(event.target);if(input)this.composing.add(input);});this.listen('compositionend',event=>{const input=field(event.target);if(input){this.composing.delete(input);this.queue();}});
      const Observer=doc.defaultView?.MutationObserver;if(Observer&&doc.body){this.observer=new Observer(records=>{if(records.some(m=>m.target?.matches?.(selector)||m.target?.closest?.('.customAnnotationLayer')||[...m.addedNodes,...m.removedNodes].some(n=>n.matches?.('.page,.customAnnotationLayer,.zma-text-math-layer')||n.matches?.(selector)||n.querySelector?.(selector))))this.queue();});this.observer.observe(doc.body,host.cloneInto({childList:true,subtree:true,attributes:true,attributeFilter:['style','data-comment','disabled','class']},doc.defaultView));}
      this.update();
    }
    listen(type,listener){this.doc.addEventListener(type,listener,true);this.listeners.push(()=>this.doc.removeEventListener(type,listener,true));}
    queue(){if(this.queued||this.closed)return;this.queued=true;Promise.resolve().then(()=>{this.queued=false;if(!this.closed)this.update();});}
    ink(input,rendered){if(input.classList.contains('zma-text-math-source')!==rendered)input.classList.toggle('zma-text-math-source',rendered);}
    drop(input,entry){this.ink(input,false);entry.view.remove();this.entries.delete(input);}
    layer(page){let layer=this.layers.get(page);if(!layer){layer=this.doc.createElementNS('http://www.w3.org/1999/xhtml','div');layer.className='zma-text-math-layer';layer.setAttribute('aria-hidden','true');this.layers.set(page,layer);}if(layer.parentElement!==page)page.append(layer);return layer;}
    update(){
      for(const [input,entry]of this.entries)if(!input.isConnected)this.drop(input,entry);
      for(const input of this.doc.querySelectorAll(selector)){
        const value=input.value||'',page=input.closest('.page');let entry=this.entries.get(input);
        if(!page||!value.includes('\\(')&&!value.includes('\\[')&&!value.includes('$')){if(entry)this.drop(input,entry);continue;}
        if(this.doc.activeElement===input||this.composing.has(input)){this.ink(input,false);if(entry)entry.view.hidden=true;continue;}
        if(!entry){const view=this.doc.createElementNS('http://www.w3.org/1999/xhtml','div');view.className='zma-text-math-view';view.dataset.annotationKey=input.getAttribute('data-id');entry={view,value:null,style:null,valid:false,ink:''};this.entries.set(input,entry);}
        if(entry.value!==value){entry.value=value;this.host.addon.bridge.renderMathPreview(entry.view,value,true);entry.valid=!!entry.view.querySelector('math');}
        if(!entry.valid){this.ink(input,false);entry.view.remove();continue;}
        const computed=this.doc.defaultView.getComputedStyle(input),style=input.getAttribute('style')||'';entry.ink=input.style.color||(!input.classList.contains('zma-text-math-source')?computed.color:entry.ink)||'currentColor';
        if(entry.style!==style){entry.style=style;entry.view.style.cssText=style;entry.view.style.padding=computed.padding;entry.view.style.fontFamily=input.style.fontFamily||computed.fontFamily;entry.view.style.fontSize=input.style.fontSize||computed.fontSize;entry.view.style.lineHeight=input.style.lineHeight||'normal';entry.view.style.color=entry.ink;}
        entry.view.dir=input.dir||'auto';entry.view.hidden=false;const layer=this.layer(page);if(entry.view.parentElement!==layer)layer.append(entry.view);this.ink(input,true);
      }
      for(const [page,layer]of this.layers)if(!page.isConnected||!layer.childElementCount){layer.remove();this.layers.delete(page);}
    }
    destroy(){this.closed=true;this.observer?.disconnect();for(const dispose of this.listeners)dispose();this.listeners=[];for(const [input,entry]of this.entries)this.drop(input,entry);for(const layer of this.layers.values())layer.remove();this.layers.clear();}
  }
  root.ZMATextMath={TextMath};
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
