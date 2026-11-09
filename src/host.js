(function(root){
  'use strict';
  const C=root.ZMACore||(typeof require!=='undefined'?require('./core.js'):null);
  const D=root.ZMADeepSeek||(typeof require!=='undefined'?require('./deepseek.js'):null);
  const R=root.ZMACapture||(typeof require!=='undefined'?require('./capture.js'):null);
  const Doc=root.ZMADocument||(typeof require!=='undefined'?require('./document.js'):null);
  const Credentials=root.ZMACredentials||(typeof require!=='undefined'?require('./credentials.js'):null);
  const Images=root.ZMAImages||(typeof require!=='undefined'?require('./images.js'):null);
  const ID='margin-comments-assistant@local.zotero';
  class Host{
    /** @type {string|undefined} */
    styleText;
    constructor(addon,{Zotero:Z,IOUtils:IO,PathUtils:P,window:win,unwrap=value=>value,cloneInto=(value,_target)=>value,chooseImage=null}){
      this.addon=addon;this.Z=Z;this.IO=IO;this.P=P;this.win=win;this.key='';this.model='deepseek-flash';this.panels=new Map();this.pending=new Map();this.closedReaders=new WeakSet();this.states=new Map();this.activeRequests=new Set();this.cache=new Map();this.cleanups=new Map();this.settingsWindows=new Set();this.running=false;
      this.credentialError='';
      this.credentials=Z.Prefs&&Z.OSKeyStore&&Credentials?new Credentials.CredentialStore({
        get:name=>Z.Prefs.get(name),set:(name,value)=>Z.Prefs.set(name,value),clear:name=>Z.Prefs.clear(name),
        encrypt:key=>Z.OSKeyStore.encrypt(key),decrypt:value=>Z.OSKeyStore.decrypt(value)
      }):null;
      this.directory=P.join(Z.DataDirectory.dir,'margin-comments-assistant');
      this.documents=new Map();this.toolbarObservers=new Map();this.unwrap=unwrap;
      this.cloneInto=cloneInto;
      this.chooseImage=chooseImage;this.imageManager=Images?new Images.ImageManager(this):null;
      this.store=new C.LocalStore({exists:p=>IO.exists(P.join(this.directory,p)),read:p=>IO.readUTF8(P.join(this.directory,p)),writeAtomic:async(p,text)=>{await IO.makeDirectory(this.directory,{ignoreExisting:true});await IO.writeUTF8(P.join(this.directory,p),text,{tmpPath:P.join(this.directory,p+'.tmp')});}});
      this.client=new D.DeepSeekClient({fetch:(...args)=>this.runtimeWindow().fetch(...args),getKey:()=>this.key,getModel:()=>this.model,TextDecoder:win?.TextDecoder});
    }
    scope(reader){const a=this.Z.Items.get(Number(reader.itemID));if(!a)throw new Error('PDF 附件不存在');return {libraryID:a.libraryID,attachmentKey:a.key};}
    groupID(source){const lib=this.Z.Libraries.get(source.libraryID);return lib?.libraryType==='group'?Number(lib.groupID||this.Z.Groups?.getGroupIDFromLibraryID?.(source.libraryID)):undefined;}
    isReadOnly(reader){const a=this.Z.Items.get(Number(reader.itemID));return a?.isEditable?.()===false;}
    sourceLink(source){return C.sourceLink(source,this.groupID(source));}
    async fingerprint(reader){const a=this.Z.Items.get(Number(reader.itemID));const path=await a.getFilePathAsync();if(!path)throw new Error('PDF 附件文件缺失');const stat=await this.IO.stat(path);return `${stat.size}:${stat.lastModified}`;}
    nativeAnnotation(reader,key){const scope=this.scope(reader),item=this.Z.Items.getByLibraryAndKey(scope.libraryID,key);if(!item?.isAnnotation?.()||item.parentID!==Number(reader.itemID))return null;return item;}
    async resolveSource(reader,query){
      const scope=this.scope(reader);let source;
      if(typeof query==='object'&&C.scopeKey(query)!==C.scopeKey(scope))throw new Error('来源不属于当前 PDF');
      if(query?.fullPage){source={...C.pickSource(query),fingerprint:await this.fingerprint(reader)};}
      else{
        const key=typeof query==='string'?query:query.annotationKey;const item=this.nativeAnnotation(reader,key);
        if(!item||item.deleted||!['image','highlight','underline'].includes(item.annotationType))throw new Error('来源已失效：请重新选择文字或区域并关联');
        let pos;try{pos=typeof item.annotationPosition==='string'?JSON.parse(item.annotationPosition):item.annotationPosition;}catch{throw new Error('来源坐标无效');}
        source={...scope,annotationKey:key,pageIndex:pos.pageIndex,pageLabel:String(item.annotationPageLabel||pos.pageIndex+1),rects:pos.rects,fingerprint:await this.fingerprint(reader),...(['highlight','underline'].includes(item.annotationType)?{kind:'text',text:String(item.annotationText||''),nextPageRects:pos.nextPageRects}:{} )};C.validateSource(source);
      }
      if(typeof query==='object'&&(query.fingerprint&&query.fingerprint!==source.fingerprint||query.pageIndex!==source.pageIndex||JSON.stringify(query.rects)!==JSON.stringify(source.rects)||query.kind==='text'&&(query.text!==source.text||JSON.stringify(query.nextPageRects)!==JSON.stringify(source.nextPageRects))))throw new Error('来源需要重新定位：PDF 文件、文字或区域已经改变');
      return {...(typeof query==='object'?query:{}),...source};
    }
    async currentPage(reader){
      const session=await this.addon.controller.ensureSession(reader);if(!session)throw new Error('PDF 阅读器尚未就绪');
      const adapter=session.adapter;const pdf=this.unwrap(adapter.pdfWindow.PDFViewerApplication.pdfDocument);const pageIndex=adapter.currentPageIndex();const page=this.unwrap(await pdf.getPage(pageIndex+1));
      return {...this.scope(reader),annotationKey:'PAGE'+String(pageIndex).padStart(4,'0'),pageIndex,pageLabel:String(adapter.pdfViewer._pageLabels?.[pageIndex]||pageIndex+1),rects:[page.view.slice()],fingerprint:await this.fingerprint(reader),fullPage:true};
    }
    async capture(reader,query){
      const source=await this.resolveSource(reader,query);const key=JSON.stringify(source);
      if(source.kind==='text')return {source,text:source.text,width:0,height:0};
      if(this.cache.has(key))return this.cache.get(key);
      const session=await this.addon.controller.ensureSession(reader);if(!session)throw new Error('PDF 阅读器尚未就绪');
      const adapter=session.adapter;const renderer=adapter.primaryView?._pdfRenderer;
      let result;
      if(typeof renderer?.renderRegionCrops==='function')result=await R.captureNativeRegion(renderer,source,adapter.document(),{cloneInto:this.cloneInto});
      else{const pdf=adapter.pdfWindow?.PDFViewerApplication?.pdfDocument;if(!pdf)throw new Error('PDF 页面尚未加载');result=await R.captureRegion(pdf,source,adapter.document(),{unwrap:this.unwrap});}
      if(this.cache.size>=16)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,result);return result;
    }
    /** @param {any} reader @param {string} question @param {{budget?:number,signal?:AbortSignal,onProgress?:(n:number,total:number)=>void}} options */
    async documentContext(reader,question,{budget=48000,signal,onProgress}={}){
      const fingerprint=await this.fingerprint(reader),scope=this.scope(reader),key=C.scopeKey(scope)+':'+fingerprint;
      const session=await this.addon.controller.ensureSession(reader);if(!session)throw new Error('当前 PDF 阅读器尚未就绪');
      const adapter=session.adapter,pdf=adapter.pdfWindow?.PDFViewerApplication?.pdfDocument;
      if(!pdf)throw new Error('当前 PDF 还未加载完成，请稍后发送');
      if(!this.documents.has(key)){if(this.documents.size>=3)this.documents.delete(this.documents.keys().next().value);const pending=Doc.extract(pdf,{unwrap:this.unwrap,signal,onProgress});this.documents.set(key,pending);pending.catch(()=>{if(this.documents.get(key)===pending)this.documents.delete(key);});}
      const index=await this.documents.get(key);if(signal?.aborted)throw new Error('文档读取已停止');
      const context=Doc.choose(index,question,adapter.currentPageIndex(),budget),attachment=this.Z.Items.get(Number(reader.itemID));
      context.title=String(attachment.getField?.('title')||'当前 PDF');
      if(context.needsImage)context.material=await this.capture(reader,await this.currentPage(reader));
      return context;
    }
    load(reader){const scope=this.scope(reader),key=C.scopeKey(scope);if(!this.states.has(key))this.states.set(key,this.store.load(scope));return this.states.get(key);}
    async save(reader,state){await this.store.save(this.scope(reader),state);this.refreshReferenceCards(reader);}
    claimRequest(reader){const key=C.scopeKey(this.scope(reader));if(this.activeRequests.has(key))throw new Error('此 PDF 已在另一窗口正在生成，请先停止或等待完成');this.activeRequests.add(key);}
    releaseRequest(reader){this.activeRequests.delete(C.scopeKey(this.scope(reader)));}
    isGenerating(reader){return this.activeRequests.has(C.scopeKey(this.scope(reader)));}
    runtimeWindow(){const win=this.Z.getMainWindow?.()||this.win;if(!win||win.closed)throw new Error('Zotero 主窗口尚未就绪，请稍后重试');return win;}
    newAbortController(){return new (this.runtimeWindow().AbortController)();}
    mainWindowLoaded(win){this.win=win;this.restoreReaders();}
    mainWindowUnloaded(win){if(this.win===win)this.win=null;}
    async panel(reader){
      if(!this.running||this.closedReaders.has(reader))throw new Error('阅读助手或窗口已关闭');
      const cached=this.panels.get(reader),docNow=reader._iframeWindow?.document;
      if(cached&&!cached.destroyed&&cached.doc===docNow){if(!cached.node.isConnected){this.installStyles(docNow);docNow.body.append(cached.node);}return cached;}
      if(cached){this.panels.delete(reader);await cached.destroy();}
      if(this.pending.has(reader))return this.pending.get(reader);
      const task=(async()=>{
        const session=await this.addon.controller.ensureSession(reader);if(this.closedReaders.has(reader)||!this.running)throw new Error('窗口已关闭');if(!session)throw new Error('PDF 阅读器尚未就绪');
        this.decorateSession(session);const doc=reader._iframeWindow?.document;if(!doc)throw new Error('阅读器窗口不存在');
        this.installStyles(doc);const panel=await new root.ZMAPanel.Panel(this,reader,doc).init();
        if(!this.running||this.closedReaders.has(reader)){await panel.destroy();throw new Error('阅读助手或窗口已关闭');}
        this.installStyles(doc);panel.disposeMath=this.addon.bridge.installMathResources(doc,()=>{});
        this.panels.set(reader,panel);this.bindReferences(reader,session.adapter.document());return panel;
      })();this.pending.set(reader,task);try{return await task;}finally{this.pending.delete(reader);}
    }
    installStyles(doc){
      if(!doc.getElementById('zma-styles')){
        if(this.Z?.File?.getContentsFromURL){this.styleText??=this.Z.File.getContentsFromURL('chrome://margincomments/content/assistant.css');const style=doc.createElementNS('http://www.w3.org/1999/xhtml','style');style.id='zma-styles';style.textContent=this.styleText;doc.head.append(style);}
        else{const link=doc.createElement('link');link.id='zma-styles';link.rel='stylesheet';link.href='chrome://margincomments/content/assistant.css';doc.head.append(link);}
      }
      if(!doc.getElementById('zma-math-styles')){const link=doc.createElement('link');link.id='zma-math-styles';link.rel='stylesheet';link.href='chrome://margincomments/content/vendor/katex/katex.min.css';doc.head.append(link);}
    }
    bindReferences(reader,doc){
      if(this.cleanups.has(doc)||this.closedReaders.has(reader))return;
      this.installStyles(doc);
      const listener=event=>{
        const link=event.target?.closest?.('a[href]');if(!link||!C.parseSourceLink(link.getAttribute('href')))return;
        event.preventDefault();event.stopPropagation();
        this.guard(async()=>{
          const state=await this.load(reader);const href=link.getAttribute('href');const location=C.parseSourceLink(href);const scope=this.scope(reader);
          if(location.attachmentKey!==scope.attachmentKey||location.groupID!==this.groupID(scope))throw new Error('该链接不属于当前 PDF');
          const targetKey=link.closest('.zmc-card')?.dataset.annotationKey;const relation=state.references.find(r=>r.link===href&&r.annotationKey===targetKey);let source;
          if(relation){source=state.sources.find(s=>s.id===relation.sourceID);if(!source)throw new Error('来源索引已删除，请重新插入引用');}
          else source=state.sources.find(s=>s.annotationKey===location.annotationKey&&s.pageIndex===location.pageIndex);
          if(!source)throw new Error('此设备没有该来源的索引，请在原文手动重新标记');
          await this.previewReference(reader,source,{annotationKey:targetKey});
        });
      };const unload=()=>{void this.closeReader(reader);},owner=reader._iframeWindow||doc.defaultView;doc.addEventListener('click',listener,true);owner?.addEventListener('unload',unload,{once:true});
      this.cleanups.set(doc,{reader,dispose:()=>{doc.removeEventListener('click',listener,true);owner?.removeEventListener('unload',unload);doc.querySelectorAll?.('#zma-styles,#zma-math-styles').forEach(n=>n.remove());}});
    }
    attachCard(session,runtime){
      if(runtime.referenceRoot)return;
      const doc=runtime.card.ownerDocument;this.bindReferences(session.reader,doc);
      const b=root.ZMAPanel.button(doc,'插入引用',async()=>{
        await session.persist(runtime);const panel=await this.panel(session.reader);await panel.showDirectory({annotationKey:runtime.annotation.key,session,runtime});
      });b.className='zma-insert-reference';b.disabled=runtime.annotation.readOnly;
      b.addEventListener('pointerdown',e=>e.stopPropagation());b.addEventListener('mousedown',e=>e.preventDefault());runtime.card.querySelector('footer')?.append(b);
      const imageButton=root.ZMAPanel.button(doc,'插入图片',()=>this.guard(async()=>{
        if(!this.chooseImage||!this.imageManager)throw new Error('图片导入尚未就绪');
        imageButton.disabled=true;
        try{await session.persist(runtime);const path=await this.chooseImage(this.runtimeWindow());if(!path)return;const state=await this.load(session.reader);await this.imageManager.importImage(session.reader,runtime.annotation.key,path,state,()=>this.save(session.reader,state));await root.ZMAMarginReferences.sync(this,session,runtime,true);}
        finally{imageButton.disabled=!!runtime.annotation.readOnly;}
      }));imageButton.className='zma-insert-image';imageButton.disabled=runtime.annotation.readOnly;
      imageButton.addEventListener('pointerdown',e=>e.stopPropagation());imageButton.addEventListener('mousedown',e=>e.preventDefault());runtime.card.querySelector('footer')?.append(imageButton);
      runtime.referenceRoot=root.ZMAPanel.el(doc,'div',undefined,'zma-reference-stack');runtime.card.insertBefore(runtime.referenceRoot,runtime.card.querySelector('footer'));
      this.syncReferences(session,runtime);
    }
    syncReferences(session,runtime){void root.ZMAMarginReferences.sync(this,session,runtime).catch(e=>{if(runtime.referenceRoot)runtime.referenceRoot.textContent=e.message;});}
    decorateSession(session){for(const runtime of session.cardRuntimes())if(!runtime.referenceRoot)this.attachCard(session,runtime);}
    refreshReferenceCards(reader,force=false){for(const session of this.addon.controller.sessions?.values()||[]){if(reader&&Number(session.reader.itemID)!==Number(reader.itemID))continue;for(const runtime of session.cardRuntimes())if(runtime.referenceRoot)void root.ZMAMarginReferences.sync(this,session,runtime,force).catch(()=>{});}}
    async previewReference(reader,source,target){
      const session=await this.addon.controller.ensureSession(reader);if(!session)throw new Error('阅读器尚未就绪');
      const runtime=session.cardRuntimes().find(r=>r.annotation.key===(target?.annotationKey||session.activeKey));
      if(!runtime)throw new Error('请先选择当前页批注，再查看前文引用');
      await root.ZMAMarginReferences.show(this,session,runtime,source);
    }
    openImageNote(reader,record){const note=this.Z.Items.getByLibraryAndKey(this.scope(reader).libraryID,record.noteKey);if(!note?.isNote?.()||note.deleted)throw new Error('图片笔记已删除');return this.runtimeWindow().ZoteroPane.openNote(note.id,{openInWindow:true});}
    async insertReference(reader,target,source,state){
      await this.resolveSource(reader,source);
      const annotation=this.nativeAnnotation(reader,target.annotationKey);if(!annotation||annotation.isEditable?.()===false)throw new Error('此批注为只读或已删除');
      if(target.runtime?.card.isConnected)await target.session.persist(target.runtime);
      const link=this.sourceLink(source);const stored=C.storedLink(source,this.groupID(source));
      if(!state.references.some(r=>r.annotationKey===target.annotationKey&&r.link===link))state.references.push({annotationKey:target.annotationKey,sourceID:source.id,link});
      await this.save(reader,state);
      const value=String(annotation.annotationComment||'');
      if(!value.includes(stored)){annotation.annotationComment=value+(value?'\n':'')+stored;await annotation.saveTx();}
      const session=target.session||await this.addon.controller.ensureSession(reader);session?.forcedKeys.add(target.annotationKey);await session?.refresh(true);
    }
    async saveComment(reader,source,text,sources=[]){
      await this.resolveSource(reader,source);const item=this.nativeAnnotation(reader,source.annotationKey);
      if(!item||item.isEditable?.()===false||this.isReadOnly(reader))throw new Error('此批注为只读，无法保存');
      const links=sources.map(s=>C.storedLink(s,this.groupID(s))).join('\n');
      item.annotationComment=String(item.annotationComment||'')+'\n\n'+String(text)+(links?'\n'+links:'');await item.saveTx();
    }
    async saveNote(reader,text,sources){
      if(this.isReadOnly(reader))throw new Error('此文献库为只读，无法保存笔记');
      for(const s of sources)await this.resolveSource(reader,s);
      const attachment=this.Z.Items.get(Number(reader.itemID));const note=new this.Z.Item('note');note.libraryID=attachment.libraryID;if(attachment.parentID)note.parentID=attachment.parentID;
      const links=sources.map(s=>`<p><a href="${C.escapeHTML(this.sourceLink(s))}">${C.escapeHTML(`${s.type||'来源'} ${s.number||''} · 第 ${s.pageLabel} 页`)}</a></p>`).join('');
      note.setNote(`<div data-schema-version="9"><p>${C.escapeHTML(text).replace(/\n/g,'<br/>')}</p>${links}</div>`);await note.saveTx();
    }
    jump(reader,source){const location={pageIndex:source.pageIndex,annotationID:source.fullPage?undefined:source.annotationKey};reader._internalReader?.navigate?.(location);}
    copy(text){this.Z.Utilities.Internal.copyTextToClipboard(text);}
    notify(message){const win=this.Z.getMainWindow?.()||this.win;if(win&&!win.closed)win.alert?.(message);else this.Z.logError?.(new Error(message));}
    guard(action){Promise.resolve().then(action).catch(e=>this.notify(e.message));}
    settingsAPI(){return {model:this.model,hasKey:!!this.key,error:this.credentialError,apply:async(key,model)=>{
      if(!this.credentials)throw new Error('当前 Zotero 不支持安全保存密钥');
      await this.credentials.save(key,model);
      if(key.trim())this.key=key.trim();this.model=model.trim();this.credentialError='';
    },clear:async()=>{await this.credentials?.clear();this.key='';this.credentialError='';},test:()=>this.client.testConnection(),bind:container=>root.ZMASettings.bind(container,this.settingsAPI())};}
    async restoreCredentials(){
      if(!this.credentials){this.credentialError='当前 Zotero 不支持安全保存密钥';return;}
      try{const saved=await this.credentials.load();this.key=saved.key;this.model=saved.model;this.credentialError='';}
      catch(e){this.key='';this.credentialError=`已保存的 DeepSeek 密钥无法读取：${e.message}`;}
    }
    bindPreferencePaneWindow(win){const container=win.document.querySelector('#zma-api-settings');root.ZMASettings?.bind(container,this.settingsAPI());}
    settings(){
      this.Z.Utilities.Internal.openPreferences('margin-comments-preferences');
    }
    selectionSnapshot(reader,params){
      const internal=this.unwrap(reader._internalReader),raw=params?.annotation||internal?._lastView?._selectionPopup?.annotation||internal?._primaryView?._selectionPopup?.annotation;
      if(!raw?.text?.trim()||!raw.position?.rects?.length)return null;
      try{const position=JSON.parse(JSON.stringify(raw.position));C.validateSource({...this.scope(reader),annotationKey:'SELECT23',pageIndex:position.pageIndex,rects:position.rects});return {type:'highlight',text:String(raw.text),position,pageLabel:String(raw.pageLabel||position.pageIndex+1),sortIndex:String(raw.sortIndex||`${String(position.pageIndex).padStart(5,'0')}|000000|00000`),color:'#ffd400',comment:''};}catch{return null;}
    }
    async saveSelection(reader,snapshot){
      if(this.isReadOnly(reader))throw new Error('此文献库为只读，不能建立文字引用');
      const item=await this.Z.Annotations.saveFromJSON(this.Z.Items.get(Number(reader.itemID)),{...snapshot,key:this.Z.DataObjectUtilities.generateKey()});return this.resolveSource(reader,item.key);
    }
    referenceTargets(reader,exclude){
      return (this.Z.Items.get(Number(reader.itemID)).getAnnotations()||[]).filter(a=>a.key!==exclude&&!a.deleted&&a.isEditable?.()!==false).map(a=>({annotationKey:a.key,label:`第 ${a.annotationPageLabel||'?'} 页 · ${String(a.annotationComment||a.annotationText||'空批注').replace(/<[^>]*>/g,'').slice(0,65)}`}));
    }
    onViewMenu=({reader,params,append})=>{
      if(!this.isPDF(reader))return;const snapshot=this.selectionSnapshot(reader,params);if(!snapshot)return;
      const disabled=this.isReadOnly(reader);
      append({label:'引用选中文字到页边批注',disabled,onCommand:()=>this.guard(async()=>{const source=await this.saveSelection(reader,snapshot),panel=await this.panel(reader);await panel.markSource(source,true);})});
      append({label:'标记选中文字为引用来源',disabled,onCommand:()=>this.guard(async()=>{const source=await this.saveSelection(reader,snapshot),panel=await this.panel(reader);await panel.markSource(source);})});
      append({label:'向 DeepSeek 提问（选中文字）',disabled,onCommand:()=>this.guard(async()=>{const panel=await this.panel(reader);panel.showChat();try{await panel.addMaterial(()=>this.saveSelection(reader,snapshot));}catch(e){panel.error(e);}})});
    };
    onToolbar=event=>{
      if(!this.isPDF(event.reader))return;
      const reader=event.reader;const b=root.ZMAPanel.button(event.doc,'DeepSeek',async()=>{const panel=await this.panel(reader);panel.showChat();});b.className='zma-toolbar';b.title='打开 DeepSeek 文档提问侧边栏';event.append(b);
      this.watchToolbar(reader,event.doc);
      this.guard(async()=>{const session=await this.addon.controller.ensureSession(reader);if(session&&!this.closedReaders.has(reader)){this.bindReferences(reader,session.adapter.document());this.decorateSession(session);}});
    };
    ensureToolbar(reader,doc){
      if(!this.running||this.closedReaders.has(reader))return;const buttons=[...doc.querySelectorAll('.zma-toolbar')];
      if(buttons.length){buttons.slice(1).forEach(b=>b.remove());return;}
      const container=doc.querySelector('.toolbar .end .custom-sections');if(container)this.onToolbar({reader,doc,append:b=>container.append(b)});
    }
    watchToolbar(reader,doc){
      if(this.toolbarObservers.has(doc)||!doc.body||!doc.defaultView?.MutationObserver)return;
      const observer=new doc.defaultView.MutationObserver(()=>this.ensureToolbar(reader,doc));observer.observe(doc.body,{childList:true,subtree:true});this.toolbarObservers.set(doc,{reader,observer});
    }
    restoreReaders(){
      if(!this.running)return;for(const reader of this.Z.Reader._readers||[])if(this.isPDF(reader)&&!this.closedReaders.has(reader))this.guard(async()=>{
        await reader._initPromise;if(!this.running||this.closedReaders.has(reader))return;const doc=reader._iframeWindow?.document;if(!doc)return;
        this.watchToolbar(reader,doc);this.ensureToolbar(reader,doc);
        const session=await this.addon.controller.ensureSession(reader);if(session&&!this.closedReaders.has(reader)){this.decorateSession(session);this.bindReferences(reader,session.adapter.document());}
      });
    }
    onMenu=({reader,params,append})=>{
      if(!this.isPDF(reader))return;const keys=Array.isArray(params?.ids)?params.ids.map(String):[];const key=keys.length===1?keys[0]:null;const item=key&&this.nativeAnnotation(reader,key);const region=item?.annotationType==='image'||['highlight','underline'].includes(item?.annotationType)&&!!item.annotationText?.trim();
      append({label:'向 DeepSeek 提问',disabled:!region,onCommand:()=>this.guard(async()=>{const panel=await this.panel(reader);panel.showChat();try{await panel.addMaterial(()=>this.resolveSource(reader,key));}catch(e){panel.error(e);}})});
      append({label:'标记为引用来源',disabled:!region||item.isEditable?.()===false||this.isReadOnly(reader),onCommand:()=>this.guard(async()=>{const panel=await this.panel(reader);await panel.markSource(await this.resolveSource(reader,key));})});
      append({label:'插入前文引用',disabled:!item||item.isEditable?.()===false||this.isReadOnly(reader),onCommand:()=>this.guard(async()=>{const panel=await this.panel(reader);await panel.showDirectory({annotationKey:key});})});
    };
    isPDF(reader){return reader?.type==='pdf'||reader?._type==='pdf';}
    async start(){
      if(this.running)return;
      await this.restoreCredentials();
      this.running=true;this.Z.Reader.registerEventListener('renderToolbar',this.onToolbar,ID);this.Z.Reader.registerEventListener('createAnnotationContextMenu',this.onMenu,ID);
      this.Z.Reader.registerEventListener('createViewContextMenu',this.onViewMenu,ID);
      for(const doc of this.addon.controller.preferenceDocuments||[])this.bindPreferencePaneWindow(doc.defaultView);
      this.observer=this.Z.Notifier.registerObserver({notify:(_event,type)=>{this.prune();if(type==='item')this.refreshReferenceCards(undefined,true);if(type==='tab')this.restoreReaders();}},['tab','item'],ID);
      this.restoreReaders();
    }
    async closeReader(reader){this.closedReaders.add(reader);for(const [doc,entry]of this.toolbarObservers)if(entry.reader===reader){entry.observer.disconnect();this.toolbarObservers.delete(doc);}const panel=this.panels.get(reader);this.panels.delete(reader);for(const [doc,entry]of this.cleanups)if(entry.reader===reader){entry.dispose();this.cleanups.delete(doc);}if(panel)await panel.destroy();}
    prune(){const live=new Set(this.Z.Reader._readers||[]);const readers=new Set([...this.panels.keys(),...[...this.cleanups.values()].map(x=>x.reader)]);for(const reader of readers)if(!live.has(reader))void this.closeReader(reader);}
    async stop(){
      this.running=false;this.key='';this.Z.Reader._unregisterEventListenerByPluginID?.(ID);if(this.observer)this.Z.Notifier.unregisterObserver(this.observer);
      for(const {observer}of this.toolbarObservers.values())observer.disconnect();this.toolbarObservers.clear();
      await Promise.allSettled(this.pending.values());await Promise.allSettled([...this.panels.values()].map(p=>p.destroy()));this.panels.clear();
      for(const entry of this.cleanups.values())entry.dispose();this.cleanups.clear();this.cache.clear();this.documents.clear();
      this.states.clear();this.activeRequests.clear();
      for(const win of this.settingsWindows)win.close();this.settingsWindows.clear();
      for(const reader of this.Z.Reader._readers||[])reader._iframeWindow?.document.querySelectorAll('.zma-toolbar,#zma-styles,#zma-math-styles').forEach(n=>n.remove());
      await this.store.flush();
    }
  }
  root.ZMAHost={Host};if(typeof module!=='undefined')module.exports=root.ZMAHost;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
