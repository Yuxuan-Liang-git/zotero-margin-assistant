(function(root){
  'use strict';
  const C=root.ZMACore;
  const {el,button}=root.ZMAPanel;
  function linksIn(value){return [...String(value).matchAll(/<a href="([^"<>]+)">/g)].map(m=>m[1].replace(/&amp;/g,'&')).filter(href=>C.parseSourceLink(href));}
  function relayout(session,runtime){session.invalidateRuntimeHeight(runtime);session.relayoutRuntime(runtime);}
  async function widget(host,session,runtime,source,href){
    const doc=runtime.card.ownerDocument,card=el(doc,'section',undefined,'zma-inline-reference');card.dataset.sourceLink=href;
    const title=el(doc,'header');title.append(el(doc,'strong',`${source.type||'来源'} (${source.number||''}) · 第 ${source.pageLabel} 页`),button(doc,'收起',()=>{card.hidden=true;relayout(session,runtime);}));card.append(title);
    for(const eventName of ['pointerdown','mousedown','click','keydown'])card.addEventListener(eventName,e=>e.stopPropagation());
    const material=await host.capture(session.reader,source);
    const img=el(doc,'img');img.src=material.dataURL;img.alt=`引用 ${source.number||''} 的原文截图`;img.addEventListener('load',()=>{if(runtime.card.isConnected)relayout(session,runtime);});
    const actions=el(doc,'div',undefined,'zma-reference-actions');actions.append(button(doc,'跳转原文',()=>host.jump(session.reader,source)),button(doc,'加入提问',async()=>{const panel=await host.panel(session.reader);panel.showChat();await panel.addMaterial(source);}));
    card.append(img);if(source.description)card.append(el(doc,'p',source.description));card.append(actions);return card;
  }
  async function sync(host,session,runtime,force=false){
    if(!runtime.referenceRoot)return;
    const token=runtime.referenceRevision=(runtime.referenceRevision||0)+1;
    const state=await host.load(session.reader);if(token!==runtime.referenceRevision||!runtime.card.isConnected)return;
    const hrefs=[...new Set(linksIn(runtime.currentValue))];
    const records=hrefs.map(href=>{const relation=state.references.find(r=>r.annotationKey===runtime.annotation.key&&r.link===href);const loc=C.parseSourceLink(href);const source=relation?state.sources.find(s=>s.id===relation.sourceID):state.sources.find(s=>s.annotationKey===loc.annotationKey&&s.pageIndex===loc.pageIndex);return {href,source};});
    const signature=JSON.stringify(records);
    if(!force&&runtime.referenceSignature===signature){
      let valid=true;for(const {source}of records){try{if(!source)throw new Error('来源索引已失效');await host.resolveSource(session.reader,source);}catch(_){valid=false;}}
      if(token!==runtime.referenceRevision||!runtime.card.isConnected||valid)return;
    }
    const fragment=runtime.card.ownerDocument.createDocumentFragment();
    for(const {href,source}of records){
      try{if(!source)throw new Error('来源索引已失效，请重新标记或插入引用');fragment.append(await widget(host,session,runtime,source,href));}
      catch(e){fragment.append(el(runtime.card.ownerDocument,'p',e.message,'zma-invalid'));}
      if(token!==runtime.referenceRevision||!runtime.card.isConnected)return;
    }
    runtime.referenceRoot.replaceChildren(fragment);runtime.referenceSignature=signature;relayout(session,runtime);
  }
  async function show(host,session,runtime,source){
    if(!runtime.referenceRoot)throw new Error('此批注还未显示，请先在页边显示评论');
    const href=host.sourceLink(source);const existing=[...runtime.referenceRoot.querySelectorAll('.zma-inline-reference')].find(n=>n.dataset.sourceLink===href);
    if(existing){
      try{await host.resolveSource(session.reader,source);}catch(e){existing.replaceChildren(el(runtime.card.ownerDocument,'p',e.message,'zma-invalid'));runtime.referenceSignature=null;}
      existing.hidden=false;relayout(session,runtime);return;
    }
    runtime.referenceRoot.append(await widget(host,session,runtime,source,href));relayout(session,runtime);
  }
  root.ZMAMarginReferences={linksIn,sync,show};
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
