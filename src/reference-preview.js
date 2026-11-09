(function(root){
  'use strict';
  const C=root.ZMACore,R=root.ZMAReferences,{el,button}=root.ZMAPanel;
  const nativeEditors='.annotation-popup .comment .editor,.annotations-view .annotation .comment .editor';
  const contains=(node,target)=>{try{return !!target&&!!node?.contains(target);}catch{return false;}};
  class ReferencePreview{
    constructor(host,reader,doc){
      this.host=host;this.reader=reader;this.doc=doc;this.entries=new Map();this.listeners=[];this.revision=0;this.closed=false;this.showTimer=null;this.hideTimer=null;this.anchor=null;this.popup=null;this.queued=false;
      this.listen(doc,'pointerover',event=>this.over(event),true);this.listen(doc,'pointerout',event=>this.out(event),true);
      this.listen(doc,'focusin',event=>{const link=this.link(event.target);if(link)this.schedule(link,0);const entry=this.editorEntry(event.target);if(entry)this.edit(entry,true);},true);
      this.listen(doc,'focusout',event=>{const entry=this.editorEntry(event.target);if(entry&&!contains(entry.editor,event.relatedTarget)){entry.editing=false;this.queue();}if(this.anchor&&!contains(this.anchor,event.relatedTarget)&&!contains(this.popup,event.relatedTarget))this.scheduleHide();},true);
      this.listen(doc,'keydown',event=>{if(event.key==='Escape'&&this.popup&&!this.popup.hidden){this.hide();event.preventDefault();event.stopPropagation();}},true);
      this.listen(doc,'scroll',event=>{if(!contains(this.popup,event.target))this.hide();},true);
      this.listen(doc.defaultView,'resize',()=>this.hide());
      const Observer=doc.defaultView?.MutationObserver;if(Observer){this.observer=new Observer(records=>{if(records.some(m=>m.target?.closest?.('.annotation-popup,.annotations-view')||[...m.addedNodes,...m.removedNodes].some(n=>n.matches?.('.annotation-popup,.annotations-view')||n.querySelector?.('.annotation-popup,.annotations-view'))))this.queue();});this.observer.observe(doc.body,host.cloneInto({childList:true,subtree:true,characterData:true},doc.defaultView));}
      this.decorate();
    }
    listen(target,type,listener,capture=false){target?.addEventListener(type,listener,capture);this.listeners.push(()=>target?.removeEventListener(type,listener,capture));}
    link(target){const link=target?.closest?.('a[href]');return link&&!link.closest('.zma-reference-popover')&&C.parseSourceLink(link.getAttribute('href'))?link:null;}
    editorEntry(target){for(const entry of this.entries.values())if(contains(entry.editor,target))return entry;return null;}
    queue(){if(this.queued||this.closed)return;this.queued=true;Promise.resolve().then(()=>{this.queued=false;if(!this.closed)this.decorate();});}
    value(content){const clone=content.cloneNode(true);return this.host.addon.bridge.readStoredComment?this.host.addon.bridge.readStoredComment(clone):clone.textContent||'';}
    decorate(){
      for(const [editor,entry]of this.entries)if(!editor.isConnected){entry.view.remove();editor.classList.remove('zma-reference-editor-hidden');this.entries.delete(editor);}
      for(const editor of this.doc.querySelectorAll(nativeEditors)){
        const content=editor.querySelector('.content');if(!content)continue;const value=this.value(content),hasLinks=root.ZMAMarginReferences.linksIn(value).length>0;let entry=this.entries.get(editor);
        if(!hasLinks){if(entry){entry.view.remove();editor.classList.remove('zma-reference-editor-hidden');this.entries.delete(editor);}continue;}
        if(!entry){const view=el(this.doc,'div',undefined,'zma-native-reference');view.dataset.annotationKey=content.id||'';entry={editor,content,view,value:null,editing:contains(editor,this.doc.activeElement)};this.entries.set(editor,entry);editor.after(view);}
        if(entry.editing)continue;
        if(entry.value!==value||!entry.view.isConnected){entry.value=value;entry.view.replaceChildren();const text=el(this.doc,'div',undefined,'zma-native-reference-text');this.host.addon.bridge.renderMathPreview(text,value);R.render(text);entry.view.append(text);
          if(content.getAttribute('contenteditable')!=='false')entry.view.append(button(this.doc,'编辑批注',()=>this.edit(entry,true)));
          if(!entry.view.isConnected)editor.after(entry.view);
        }
        editor.classList.add('zma-reference-editor-hidden');entry.view.hidden=false;
      }
      if(this.anchor&&!this.anchor.isConnected)this.hide();
    }
    edit(entry,focus){entry.editing=true;entry.view.hidden=true;entry.editor.classList.remove('zma-reference-editor-hidden');this.hide();if(focus&&!contains(entry.editor,this.doc.activeElement))entry.content.focus();}
    cancelHide(){clearTimeout(this.hideTimer);this.hideTimer=null;}
    scheduleHide(){clearTimeout(this.showTimer);this.showTimer=null;this.cancelHide();this.hideTimer=setTimeout(()=>this.hide(),180);}
    over(event){if(contains(this.popup,event.target)){this.cancelHide();return;}const link=this.link(event.target);if(link&&!contains(link,event.relatedTarget))this.schedule(link);}
    out(event){if(contains(this.popup,event.relatedTarget)||contains(this.anchor,event.relatedTarget)){this.cancelHide();return;}if(contains(this.popup,event.target)||contains(this.anchor,event.target))this.scheduleHide();}
    schedule(link,delay=220){this.cancelHide();clearTimeout(this.showTimer);if(this.anchor===link&&this.popup&&!this.popup.hidden)return;this.showTimer=setTimeout(()=>{this.showTimer=null;void this.open(link);},delay);}
    hide(){clearTimeout(this.showTimer);this.showTimer=null;this.cancelHide();this.revision++;this.anchor=null;if(this.popup)this.popup.hidden=true;}
    mapRect(rect,doc,clip=false){
      let r={left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};const same=(a,b)=>this.host.unwrap(a)===this.host.unwrap(b);
      try{for(let i=0;i<5;i++){
        if(clip){const win=doc.defaultView;r={left:Math.max(0,r.left),right:Math.min(win.innerWidth,r.right),top:Math.max(0,r.top),bottom:Math.min(win.innerHeight,r.bottom)};if(r.right<=r.left||r.bottom<=r.top)return null;}
        if(same(doc,this.doc))return r;const frame=doc.defaultView.frameElement;if(!frame)return null;const f=frame.getBoundingClientRect(),sx=f.width/(frame.offsetWidth||f.width),sy=f.height/(frame.offsetHeight||f.height);r={left:f.left+(frame.clientLeft+r.left)*sx,right:f.left+(frame.clientLeft+r.right)*sx,top:f.top+(frame.clientTop+r.top)*sy,bottom:f.top+(frame.clientTop+r.bottom)*sy};doc=frame.ownerDocument;
      }}catch{}return null;
    }
    geometry(){
      const union=rects=>rects.length?{left:Math.min(...rects.map(r=>r.left)),right:Math.max(...rects.map(r=>r.right)),top:Math.min(...rects.map(r=>r.top)),bottom:Math.max(...rects.map(r=>r.bottom))}:null;
      const paper=[],protectedRects=[],owner=this.anchor.closest('.zmc-card,.annotation-popup')||this.anchor;protectedRects.push(owner.getBoundingClientRect());
      try{
        const pdfDoc=this.adapter?.document?.()||this.doc;for(const page of pdfDoc.querySelectorAll('.page[data-page-number]')){const rect=this.mapRect(page.getBoundingClientRect(),pdfDoc,true);if(rect)paper.push(rect);}
        const key=this.anchor.closest('.zmc-card')?.dataset.annotationKey||this.anchor.closest('.zma-native-reference')?.dataset.annotationKey,item=key&&this.host.nativeAnnotation(this.reader,key),raw=item?.annotationPosition,pos=typeof raw==='string'?JSON.parse(raw):raw,page=pos&&this.adapter?.page?.(pos.pageIndex);
        if(page?.viewport&&pos.rects?.length){const r=page.element.getBoundingClientRect(),v=page.viewport,sx=r.width/v.width,sy=r.height/v.height;
          for(const box of pos.rects){const a=v.convertToViewportPoint(box[0],box[1]),b=v.convertToViewportPoint(box[2],box[3]),rect=this.mapRect({left:r.left+Math.min(a[0],b[0])*sx,right:r.left+Math.max(a[0],b[0])*sx,top:r.top+Math.min(a[1],b[1])*sy,bottom:r.top+Math.max(a[1],b[1])*sy},page.element.ownerDocument,true);if(rect)protectedRects.push(rect);}
        }
      }catch{/* Keep the DOM annotation as a conservative placement boundary. */}
      return {paper:union(paper),protected:union(protectedRects)};
    }
    position(){
      if(!this.anchor?.isConnected||!this.popup)return;const r=this.anchor.getBoundingClientRect(),win=this.doc.defaultView,h=win.innerHeight,geometry=this.geometry();let w=win.innerWidth,start=8;
      for(const side of this.doc.querySelectorAll('.zma-panel:not(.zma-pdf-quote-portal)'))if(!side.hidden){const s=side.getBoundingClientRect();if(s.width>=200&&s.right>=w-1&&s.left>240)w=Math.min(w,s.left);}
      const toolbar=this.doc.querySelector('.toolbar')?.getBoundingClientRect();if(toolbar?.height>0&&toolbar.bottom<h/3)start=Math.max(start,toolbar.bottom+8);
      let area=null,align='top';if(geometry.paper){const p=geometry.paper,candidates=[{left:8,top:start,width:p.left-20,height:h-start-8},{left:p.right+12,top:start,width:w-p.right-20,height:h-start-8}].filter(a=>a.width>=240);candidates.sort((a,b)=>b.width-a.width);area=candidates[0];}
      if(!area){const p=geometry.protected||r,above=Math.max(0,p.top-12-start),below=Math.max(0,h-8-p.bottom-12);align=above>below?'bottom':'top';area=above>below?{left:8,top:start,width:w-16,height:above}:{left:8,top:p.bottom+12,width:w-16,height:below};
        if(area.height<80){area={left:8,top:Math.max(start,h-Math.min(180,h/3)-8),width:w-16,height:Math.min(180,h/3)};align='top';}
      }
      const width=Math.max(1,Math.min(740,area.width)),style=this.popup.style;style.minWidth=Math.min(240,width)+'px';style.width=width+'px';style.maxWidth=width+'px';style.maxHeight=Math.max(1,area.height)+'px';
      const p=this.popup.getBoundingClientRect(),left=Math.max(area.left,Math.min(r.left,area.left+area.width-p.width)),top=align==='bottom'?area.top+area.height-p.height:Math.max(area.top,Math.min(r.top,area.top+area.height-p.height));style.left=left+'px';style.top=Math.max(start,top)+'px';
    }
    async source(link){
      const href=link.getAttribute('href'),location=C.parseSourceLink(href),scope=this.host.scope(this.reader);
      if(!location||location.attachmentKey!==scope.attachmentKey||location.groupID!==this.host.groupID(scope))throw new Error('该链接不属于当前 PDF');
      const state=await this.host.load(this.reader),key=link.closest('.zmc-card')?.dataset.annotationKey||link.closest('.zma-native-reference')?.dataset.annotationKey,relation=state.references.find(r=>r.link===href&&r.annotationKey===key);
      const source=relation?state.sources.find(s=>s.id===relation.sourceID):state.sources.find(s=>s.annotationKey===location.annotationKey&&s.pageIndex===location.pageIndex);
      if(!source)throw new Error('来源索引已失效，请重新标记或插入引用');return source;
    }
    async open(link){
      if(this.closed||!link?.isConnected)return;this.hide();const revision=this.revision;this.anchor=link;
      if(!this.popup){this.popup=el(this.doc,'section',undefined,'zma-reference-popover');this.popup.setAttribute('role','dialog');this.popup.setAttribute('aria-label','前文引用预览');this.doc.body.append(this.popup);}
      const popup=this.popup;popup.hidden=false;popup.replaceChildren(el(this.doc,'p','正在读取引用内容…'));this.position();
      try{
        const session=await this.host.addon.controller.ensureSession(this.reader);if(this.closed||revision!==this.revision||!link.isConnected)return;this.adapter=session?.adapter;this.position();
        const source=await this.source(link),material=await this.host.capture(this.reader,source);if(this.closed||revision!==this.revision||!link.isConnected)return;
        const title=el(this.doc,'header');title.append(el(this.doc,'strong',`${source.type||'来源'} (${source.number||''}) · 第 ${source.pageLabel} 页`),button(this.doc,'关闭',()=>this.hide()));
        let content;if(source.kind==='text'){content=el(this.doc,'blockquote',undefined,'zma-reference-text');this.host.addon.bridge.renderMathPreview(content,material.text||source.text||'');}else{content=el(this.doc,'img');content.alt=`引用 ${source.number||''} 的原文截图`;content.addEventListener('load',()=>{if(revision===this.revision)this.position();},{once:true});content.src=material.dataURL;}
        const actions=el(this.doc,'footer');actions.append(button(this.doc,'跳转原文',()=>{this.hide();this.host.jump(this.reader,source);}),button(this.doc,'加入提问',async()=>{this.hide();const panel=await this.host.panel(this.reader);panel.showChat();await panel.addMaterial(source);}));popup.replaceChildren(title,content);if(source.description)popup.append(el(this.doc,'p',source.description));popup.append(actions);this.position();
      }catch(e){if(revision===this.revision&&!this.closed){popup.replaceChildren(el(this.doc,'p','引用无法预览：'+e.message,'zma-invalid'),button(this.doc,'关闭',()=>this.hide()));this.position();}}
    }
    destroy(){this.closed=true;this.hide();this.observer?.disconnect();for(const dispose of this.listeners)dispose();this.listeners=[];for(const entry of this.entries.values()){entry.view.remove();entry.editor.classList.remove('zma-reference-editor-hidden');}this.entries.clear();this.popup?.remove();}
  }
  root.ZMAReferencePreview={ReferencePreview};
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
