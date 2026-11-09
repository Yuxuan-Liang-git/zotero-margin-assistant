(function(root){
  'use strict';
  const C=root.ZMACore||(typeof require!=='undefined'?require('./core.js'):null);
  const D=root.ZMADeepSeek||(typeof require!=='undefined'?require('./deepseek.js'):null);
  const R=root.ZMACapture||(typeof require!=='undefined'?require('./capture.js'):null);
  const Doc=root.ZMADocument||(typeof require!=='undefined'?require('./document.js'):null);
  const Credentials=root.ZMACredentials||(typeof require!=='undefined'?require('./credentials.js'):null);
  const Auth=root.ZMAChatGPTAuth||(typeof require!=='undefined'?require('./chatgpt-auth.js'):null);
  const GPT=root.ZMAChatGPT||(typeof require!=='undefined'?require('./chatgpt.js'):null);
  const Images=root.ZMAImages||(typeof require!=='undefined'?require('./images.js'):null);
  const Attachments=root.ZMAAttachments||(typeof require!=='undefined'?require('./attachments.js'):null);
  const ID='margin-comments-assistant@local.zotero';
  class Host{
    /** @type {string|undefined} */
    styleText;
    constructor(addon,{Zotero:Z,IOUtils:IO,PathUtils:P,window:win,unwrap=value=>value,cloneInto=(value,_target)=>value,chooseImage=null,chatgptListen=null,chooseChatFiles=null,readClipboardAssets=null}){
      this.addon=addon;this.Z=Z;this.IO=IO;this.P=P;this.win=win;this.key='';this.model='deepseek-flash';this.panels=new Map();this.pending=new Map();this.closedReaders=new WeakSet();this.states=new Map();this.activeRequests=new Set();this.cache=new Map();this.cleanups=new Map();this.settingsWindows=new Set();this.running=false;
      this.credentialError='';
      this.credentials=Z.Prefs&&Z.OSKeyStore&&Credentials?new Credentials.CredentialStore({
        get:name=>Z.Prefs.get(name),set:(name,value)=>Z.Prefs.set(name,value),clear:name=>Z.Prefs.clear(name),
        encrypt:key=>Z.OSKeyStore.encrypt(key),decrypt:value=>Z.OSKeyStore.decrypt(value)
      }):null;
      this.directory=P.join(Z.DataDirectory.dir,'margin-comments-assistant');this.historyPanes=new Map();
      this.documents=new Map();this.pdfFiles=new Map();this.toolbarObservers=new Map();this.unwrap=unwrap;
      this.cloneInto=cloneInto;
      this.chooseChatFiles=chooseChatFiles;this.readClipboardAssets=readClipboardAssets;this.attachmentManager=Attachments?new Attachments.AttachmentManager(this):null;this.chooseImage=chooseImage;this.imageManager=Images?new Images.ImageManager(this):null;
      this.store=new C.LocalStore({exists:async p=>{const sidecar=await this.pdfStatePath(p);if(await IO.exists(sidecar))return true;
        if(p.endsWith('.json')){const old=P.join(this.directory,p);if(await IO.exists(old)){const raw=await IO.readUTF8(old);await IO.writeUTF8(sidecar,raw,{tmpPath:sidecar+'.tmp'});return true;}}return false;},
        read:async p=>IO.readUTF8(await this.pdfStatePath(p)),writeAtomic:async(p,value)=>{const path=await this.pdfStatePath(p);await IO.writeUTF8(path,value,{tmpPath:path+'.tmp'});}});
      this.client=new D.DeepSeekClient({fetch:(...args)=>this.runtimeWindow().fetch(...args),getKey:()=>this.key,getModel:()=>this.model,TextDecoder:win?.TextDecoder});
      this.provider=Z.Prefs?.get('margincomments.provider')==='chatgpt'?'chatgpt':'deepseek';this.providerListeners=new Set();this.authError='';
      const fontSize=Z.Prefs?.get('margincomments.fontSize');this.fontSize=Number.isSafeInteger(fontSize)&&fontSize>=12&&fontSize<=24?fontSize:14;this.appearanceListeners=new Set();
      this.webPreferences={mode:Z.Prefs?.get('margincomments.webMode')==='off'?'off':'auto',images:Z.Prefs?.get('margincomments.webImages')!==false};
      if(this.credentials&&Auth&&GPT){
        const platform={crypto:win?.crypto||globalThis.crypto,URL:win?.URL||globalThis.URL,URLSearchParams:win?.URLSearchParams||globalThis.URLSearchParams,TextEncoder:win?.TextEncoder||globalThis.TextEncoder,TextDecoder:win?.TextDecoder||globalThis.TextDecoder,AbortController:win?.AbortController||globalThis.AbortController,atob:win?.atob?.bind(win)||globalThis.atob,btoa:win?.btoa?.bind(win)||globalThis.btoa};
        this.auth=new Auth.AuthManager({adapter:this.credentials.adapter,platform,fetch:(...args)=>this.runtimeWindow().fetch(...args),listen:chatgptListen||(()=>{throw new Error('ChatGPT 登录监听器不可用，请重新安装插件并重启 Zotero。');}),openBrowser:url=>this.Z.launchURL(url),onChange:()=>this.providersChanged()});
        this.chatgpt=new GPT.ChatGPTClient({auth:this.auth,fetch:(...args)=>this.runtimeWindow().fetch(...args),TextDecoder:win?.TextDecoder,getWebOptions:()=>this.webState()});
      }
    }
    providerLabel(){return this.provider==='chatgpt'?'ChatGPT':'DeepSeek';}
    webState(){return {...this.webPreferences};}
    webAPI(){return {state:()=>this.webState(),setMode:value=>this.setWebMode(value),setImages:value=>this.setWebImages(value),watch:listener=>{this.providerListeners.add(listener);return ()=>this.providerListeners.delete(listener);}};}
    async setWebMode(value){this.providerIdle();if(!['auto','off'].includes(value))throw new Error('联网搜索选项无效');this.Z.Prefs?.set('margincomments.webMode',value);this.webPreferences.mode=value;this.providersChanged();}
    async setWebImages(value){this.providerIdle();if(typeof value!=='boolean')throw new Error('配图选项无效');this.Z.Prefs?.set('margincomments.webImages',value);this.webPreferences.images=value;this.providersChanged();}
    appearanceState(){return {fontSize:this.fontSize};}
    appearanceAPI(){return {state:()=>this.appearanceState(),setFontSize:value=>this.setFontSize(value),watch:listener=>{this.appearanceListeners.add(listener);return ()=>this.appearanceListeners.delete(listener);}};}
    async setFontSize(value){const size=Number(value);if(!Number.isSafeInteger(size)||size<12||size>24)throw new Error('字体大小须为 12 至 24 px 的整数');this.Z.Prefs?.set('margincomments.fontSize',size);this.fontSize=size;for(const panel of this.panels.values())panel.applyAppearance?.();for(const listener of this.appearanceListeners)listener();}
    providerState(){const account=this.auth?.active(),selected=account?.models?.find(m=>m.slug===account.model);return {provider:this.provider,label:this.providerLabel(),signedIn:!!account?.accessToken,accountLabel:this.auth?.accounts().find(a=>a.id===account?.id)?.label||'',model:this.provider==='chatgpt'?account?.model||'':this.model,models:this.provider==='chatgpt'?account?.models||[]:[],reasoningEffort:account?.reasoningEffort||'default',reasoningEfforts:selected&&GPT?GPT.reasoningEfforts(selected):[],speed:account?.speed||'default',speedTiers:selected&&GPT?GPT.speedTiers(selected):['default'],error:this.authError};}
    providersChanged(){for(const panel of this.panels.values())panel.refreshProvider?.();for(const listener of this.providerListeners)listener();}
    providerIdle(){if(this.activeRequests.size)throw new Error('请先停止或等待正在生成的回答，再更改服务或账户。');}
    async setProvider(value){this.providerIdle();if(!['deepseek','chatgpt'].includes(value))throw new Error('服务名称无效');this.Z.Prefs?.set('margincomments.provider',value);this.provider=value;this.providersChanged();}
    selectedClient(){if(this.provider!=='chatgpt')return this.client;if(!this.auth?.active()?.accessToken)throw new Error('请先在设置中登录 ChatGPT，再发送问题。');return this.chatgpt.forAccount(this.auth.state.activeID);}
    async setChatGPTModel(model){this.providerIdle();await this.auth?.setModel(model);}
    async prepareChatGPTControls(){this.providerIdle();const account=this.auth?.active();if(account?.models?.some(m=>m.capabilitiesVersion!==2))await this.auth.setModels(account.id,account.models.map(m=>({...m,reasoningEfforts:GPT.reasoningEfforts(m),speedTiers:GPT.speedTiers(m),capabilitiesVersion:2})));}
    async setChatGPTReasoning(value){await this.prepareChatGPTControls();await this.auth?.setReasoning(value);}
    async setChatGPTSpeed(value){await this.prepareChatGPTControls();await this.auth?.setSpeed(value);} 
    chatGPTAPI(){return {state:()=>({...this.providerState(),accounts:this.auth?.accounts()||[],activeID:this.auth?.state.activeID,pending:!!this.auth?.pending}),watch:listener=>{this.providerListeners.add(listener);return ()=>this.providerListeners.delete(listener);},provider:value=>this.setProvider(value),select:async id=>{this.providerIdle();await this.auth?.select(id);},model:value=>this.setChatGPTModel(value),reasoning:value=>this.setChatGPTReasoning(value),speed:value=>this.setChatGPTSpeed(value),refresh:async()=>{this.providerIdle();if(!this.chatgpt)throw new Error('ChatGPT 授权模块不可用');return this.chatgpt.models();},login:async id=>{
      this.providerIdle();if(!this.auth)throw new Error('ChatGPT 安全登录不可用，请重启 Zotero。');this.authError='';await this.auth.signIn(id||undefined);await this.setProvider('chatgpt');
      if(!this.auth.state.welcomed){this.notify('正在使用你的 Codex / ChatGPT Work 共享订阅额度。发送问题会使用当前 PDF 内容与本地对话；可在“管理用量”中调整应用额度。');await this.auth.update(s=>({...s,welcomed:true}));}
      await this.chatgpt.models();
    },cancel:()=>this.auth?.cancelSignIn(),logout:async()=>{for(const panel of this.panels.values())panel.controller?.abort();this.authError=await this.auth?.signOut()||'';this.providersChanged();return this.authError;},usage:()=>this.Z.launchURL('https://chatgpt.com/settings/usage')};}
    scope(reader){const a=this.Z.Items.get(Number(reader.itemID));if(!a)throw new Error('PDF 附件不存在');return {libraryID:a.libraryID,attachmentKey:a.key};}
    async pdfStatePath(name){const match=/^([1-9]\d*)-([A-Z0-9]{8})\.json(?:\.v1\.bak)?$/.exec(name);
      if(!match)throw new Error('对话文件名无效');const attachment=this.Z.Items.getByLibraryAndKey(Number(match[1]),match[2]);
      if(!attachment?.isPDFAttachment?.())throw new Error('PDF 附件不存在');const pdf=await attachment.getFilePathAsync();if(!pdf)throw new Error('PDF 文件缺失，无法保存对话');
      return this.P.join(this.P.parent(pdf),'margin-comments-assistant-'+name);
    }
    historyMarker(scope){return `zma-history://${scope.libraryID}/${scope.attachmentKey}`;}
    historyTarget(note){if(!note?.isNote?.()||note.deleted)return null;const match=/zma-history:\/\/([1-9]\d*)\/([A-Z0-9]{8})/.exec(note.getNote?.()||'');
      if(!match||Number(match[1])!==note.libraryID)return null;const attachment=this.Z.Items.getByLibraryAndKey(note.libraryID,match[2]);
      return attachment?.isPDFAttachment?.()&&Number(attachment.parentID||0)===Number(note.parentID||0)?attachment:null;
    }
    async ensureHistoryNote(reader){const attachment=this.Z.Items.get(Number(reader.itemID));
      if(!attachment?.parentID||attachment.isEditable?.()===false||!this.Z.Item)return;
      const parent=this.Z.Items.get(attachment.parentID);if(!parent?.isRegularItem?.()||!parent.getNotes)return;
      for(const id of parent.getNotes()){const note=this.Z.Items.get(id);if(this.historyTarget(note)?.id===attachment.id)return;}
      const note=new this.Z.Item('note');note.libraryID=attachment.libraryID;note.parentID=parent.id;
      note.setNote(`<div data-schema-version="9"><p>DeepSeek 对话历史</p><p>双击此条目打开该 PDF 的对话列表；记录保存在 PDF 同目录。</p><p>${this.historyMarker(this.scope(reader))}</p></div>`);
      await note.saveTx();
    }
    bindHistoryPane(win){const pane=win?.ZoteroPane;if(!pane?.viewItems||this.historyPanes.has(win))return;
      const original=pane.viewItems,host=this;
      const wrapped=async function(items,event,options){const normal=[];
        for(const item of items){const target=host.historyTarget(item);if(target)await host.openHistory(target);else normal.push(item);}
        if(normal.length)return original.call(this,normal,event,options);
      };
      pane.viewItems=wrapped;this.historyPanes.set(win,{pane,original,wrapped});
    }
    async openHistory(attachment){let reader=await this.Z.Reader.open(attachment.id);
      if(!reader){for(let i=0;i<100&&!reader;i++){await new Promise(resolve=>setTimeout(resolve,50));reader=(this.Z.Reader._readers||[]).find(r=>r.itemID===attachment.id);}}
      if(!reader)throw new Error('PDF 阅读器未能打开');await reader._initPromise;const panel=await this.panel(reader);panel.showConversations();
    }
    groupID(source){const lib=this.Z.Libraries.get(source.libraryID);return lib?.libraryType==='group'?Number(lib.groupID||this.Z.Groups?.getGroupIDFromLibraryID?.(source.libraryID)):undefined;}
    isReadOnly(reader){const a=this.Z.Items.get(Number(reader.itemID));return a?.isEditable?.()===false;}
    sourceLink(source){return C.sourceLink(source,this.groupID(source));}
    async fingerprint(reader){const a=this.Z.Items.get(Number(reader.itemID));const path=await a.getFilePathAsync();if(!path)throw new Error('PDF 附件文件缺失');const stat=await this.IO.stat(path);return `${stat.size}:${stat.lastModified}`;}
    nativeAnnotation(reader,key){const scope=this.scope(reader),item=this.Z.Items.getByLibraryAndKey(scope.libraryID,key);if(!item?.isAnnotation?.()||item.parentID!==Number(reader.itemID))return null;return item;}
    async resolveSource(reader,query){
      const scope=this.scope(reader);let source;
      if(typeof query==='object'&&C.scopeKey(query)!==C.scopeKey(scope))throw new Error('来源不属于当前 PDF');
      if(query?.fullPage||query?.selection&&query.kind==='text'){source={...C.pickSource(query),fingerprint:await this.fingerprint(reader)};}
      else{
        const key=typeof query==='string'?query:query.annotationKey;const item=this.nativeAnnotation(reader,key);
        if(!item||item.deleted||!['image','highlight','underline'].includes(item.annotationType))throw Object.assign(new Error('来源已失效：请重新选择文字或区域并关联'),{code:'SOURCE_MISSING'});
        let pos;try{pos=typeof item.annotationPosition==='string'?JSON.parse(item.annotationPosition):item.annotationPosition;}catch{throw new Error('来源坐标无效');}
        source={...scope,annotationKey:key,pageIndex:pos.pageIndex,pageLabel:String(item.annotationPageLabel||pos.pageIndex+1),rects:pos.rects,fingerprint:await this.fingerprint(reader),...(['highlight','underline'].includes(item.annotationType)?{kind:'text',text:String(item.annotationText||''),nextPageRects:pos.nextPageRects}:{} )};C.validateSource(source);
      }
      if(typeof query==='object'&&(query.fingerprint&&query.fingerprint!==source.fingerprint||query.pageIndex!==source.pageIndex||JSON.stringify(query.rects)!==JSON.stringify(source.rects)||query.kind==='text'&&(query.text!==source.text||JSON.stringify(query.nextPageRects)!==JSON.stringify(source.nextPageRects))))throw Object.assign(new Error('来源需要重新定位：PDF 文件、文字或区域已经改变'),{code:'SOURCE_STALE'});
      return {...(typeof query==='object'?query:{}),...source};
    }
    /** @param {any} reader @param {number|null} [requestedPage] */
    async currentPage(reader,requestedPage=null){
      const session=await this.addon.controller.ensureSession(reader);if(!session)throw new Error('PDF 阅读器尚未就绪');
      const adapter=session.adapter;const pdf=this.unwrap(adapter.pdfWindow.PDFViewerApplication.pdfDocument);const pageIndex=requestedPage??adapter.currentPageIndex();if(!Number.isSafeInteger(pageIndex)||pageIndex<0||pageIndex>=pdf.numPages)throw new Error('PDF 页码无效');const page=this.unwrap(await pdf.getPage(pageIndex+1));
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
    /** @param {any} reader @param {string} question @param {{budget?:number,imageLimit?:number,imageBudget?:number,preferPDFFile?:boolean,signal?:AbortSignal,onProgress?:(n:number,total:number)=>void}} options */
    async documentContext(reader,question,{budget=48000,imageLimit=3,imageBudget=4*1024*1024,preferPDFFile=false,signal,onProgress}={}){
      const fingerprint=await this.fingerprint(reader),scope=this.scope(reader),key=C.scopeKey(scope)+':'+fingerprint;
      const session=await this.addon.controller.ensureSession(reader);if(!session)throw new Error('当前 PDF 阅读器尚未就绪');
      const adapter=session.adapter,pdf=adapter.pdfWindow?.PDFViewerApplication?.pdfDocument;
      if(!pdf)throw new Error('当前 PDF 还未加载完成，请稍后发送');
      if(!this.documents.has(key)){if(this.documents.size>=3)this.documents.delete(this.documents.keys().next().value);const pending=Doc.extract(pdf,{unwrap:this.unwrap,signal,onProgress});this.documents.set(key,pending);pending.catch(()=>{if(this.documents.get(key)===pending)this.documents.delete(key);});}
      const index=await this.documents.get(key);if(signal?.aborted)throw new Error('文档读取已停止');
      const context=Doc.choose(index,question,adapter.currentPageIndex(),budget),attachment=this.Z.Items.get(Number(reader.itemID));
      context.title=String(attachment.getField?.('title')||'当前 PDF');
      context.materials=[];context.imageWarning='';let bytes=0;const warnings=new Set(),limit=Math.max(0,Math.min(3,Math.floor(imageLimit)));
      if(preferPDFFile){
        if(index.totalPages>20)warnings.add('超过自动整份 PDF 的 20 页范围，改用文字及页面图片');
        else if(limit<1)warnings.add('材料数量已达上限，完整 PDF 未加入');
        else try{
          let file=this.pdfFiles.get(key);if(!file){file=await this.attachmentManager.currentPDF(reader,{maxDataBytes:imageBudget});if(signal?.aborted)throw new Error('文档读取已停止');if(await this.fingerprint(reader)!==fingerprint)throw new Error('PDF 文件在读取时改变，请重试');if(this.pdfFiles.size>=3)this.pdfFiles.delete(this.pdfFiles.keys().next().value);this.pdfFiles.set(key,file);}
          if(signal?.aborted)throw new Error('文档读取已停止');
          if(String(file.dataURL).length+1000<=imageBudget)return {...context,mode:'full-pdf',file,text:'',pages:Array.from({length:index.totalPages},(_,i)=>i+1)};
          warnings.add('本轮空间不足，完整 PDF 未加入，改用文字及页面图片');
        }catch(e){if(signal?.aborted)throw new Error('文档读取已停止');warnings.add('完整 PDF 读取受限，改用文字及页面图片');}
      }
      for(const page of context.imagePages){
        if(signal?.aborted)throw new Error('文档读取已停止');
        if(context.materials.length>=limit){warnings.add('材料数量已达上限，部分页面图片未加入');break;}
        try{
          const source=await this.currentPage(reader,page-1);let material={...await this.capture(reader,{...source,automaticPage:true}),text:''};if(material.dataURL?.length>=256000)material=await R.compactAutomaticPage(material,adapter.document());
          if(signal?.aborted)throw new Error('文档读取已停止');
          const size=JSON.stringify(material).length;
          if(bytes+size>imageBudget){warnings.add('请求大小受限，部分页面图片未加入');continue;}
          context.materials.push(material);bytes+=size;
        }catch(e){if(signal?.aborted)throw new Error('文档读取已停止');warnings.add(`PDF 第 ${page} 页图片读取失败`);}
      }
      if(!context.text&&!context.materials.length&&limit>0)throw new Error('PDF 页面图片读取失败或超过材料上限，请减少附件或重新打开目标页');
      context.imageWarning=[...warnings].join('；');
      return context;
    }
    load(reader){const scope=this.scope(reader),key=C.scopeKey(scope);if(!this.states.has(key))this.states.set(key,(async()=>{const state=await this.store.load(scope);try{await this.ensureHistoryNote(reader);}catch(e){this.Z.logError?.(e);}return state;})());return this.states.get(key);}
    async save(reader,state){await this.store.save(this.scope(reader),state);this.refreshReferenceCards(reader);}
    claimRequest(reader){const key=C.scopeKey(this.scope(reader));if(this.activeRequests.has(key))throw new Error('此 PDF 已在另一窗口正在生成，请先停止或等待完成');this.activeRequests.add(key);}
    releaseRequest(reader){this.activeRequests.delete(C.scopeKey(this.scope(reader)));}
    isGenerating(reader){return this.activeRequests.has(C.scopeKey(this.scope(reader)));}
    runtimeWindow(){const win=this.Z.getMainWindow?.()||this.win;if(!win||win.closed)throw new Error('Zotero 主窗口尚未就绪，请稍后重试');return win;}
    newAbortController(){return new (this.runtimeWindow().AbortController)();}
    mainWindowLoaded(win){this.win=win;this.bindHistoryPane(win);this.restoreReaders();}
    mainWindowUnloaded(win){this.unbindHistoryPane(win);if(this.win===win)this.win=null;}
    unbindHistoryPane(win){const entry=this.historyPanes.get(win);if(!entry)return;if(entry.pane.viewItems===entry.wrapped)entry.pane.viewItems=entry.original;this.historyPanes.delete(win);}
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
        this.installStyles(doc);panel.disposeMath=this.addon.bridge.installMathResources(doc,()=>{});await panel.quotes?.attachPDF(session.adapter);
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
      const preview=root.ZMAReferencePreview?new root.ZMAReferencePreview.ReferencePreview(this,reader,doc):null;
      const textMath=root.ZMATextMath?new root.ZMATextMath.TextMath(this,doc):null;
      const listener=event=>{
        const link=event.target?.closest?.('a[href]');if(!link||!C.parseSourceLink(link.getAttribute('href')))return;
        event.preventDefault();event.stopPropagation();
        if(preview&&!link.closest('.zmc-card')){void preview.open(link);return;}
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
      this.cleanups.set(doc,{reader,preview,textMath,dispose:()=>{textMath?.destroy();preview?.destroy();doc.removeEventListener('click',listener,true);owner?.removeEventListener('unload',unload);doc.querySelectorAll?.('#zma-styles,#zma-math-styles').forEach(n=>n.remove());}});
      const outer=reader._iframeWindow?.document;if(outer&&outer!==doc)this.bindReferences(reader,outer);
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
    refreshReferenceCards(reader,force=false){for(const entry of this.cleanups.values())if(!reader||Number(entry.reader.itemID)===Number(reader.itemID))entry.preview?.hide();for(const session of this.addon.controller.sessions?.values()||[]){if(reader&&Number(session.reader.itemID)!==Number(reader.itemID))continue;for(const runtime of session.cardRuntimes())if(runtime.referenceRoot)void root.ZMAMarginReferences.sync(this,session,runtime,force).catch(()=>{});}}
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
    jump(reader,source){const location={pageIndex:source.pageIndex,annotationID:source.fullPage||source.selection?undefined:source.annotationKey};reader._internalReader?.navigate?.(location);}
    copy(text){this.Z.Utilities.Internal.copyTextToClipboard(text);}
    openExternal(url){this.Z.launchURL(url);}
    importAttachment(reader,input){if(!this.attachmentManager)throw new Error('附件模块不可用，请重启 Zotero');return this.attachmentManager.import(reader,input);}
    loadAttachment(reader,record){return this.attachmentManager.load(reader,record);}
    readAttachmentClipboard(){return this.readClipboardAssets?.()||[];}
    async chooseAttachments(){return (await this.chooseChatFiles?.(this.runtimeWindow())||[]).map(path=>({path}));}
    readClipboard(){return this.Z.Utilities.Internal.getClipboard('text/plain');}
    notify(message){const win=this.Z.getMainWindow?.()||this.win;if(win&&!win.closed)win.alert?.(message);else this.Z.logError?.(new Error(message));}
    guard(action){Promise.resolve().then(action).catch(e=>this.notify(e.message));}
    settingsAPI(){return {model:this.model,hasKey:!!this.key,error:this.credentialError,apply:async(key,model)=>{
      if(!this.credentials)throw new Error('当前 Zotero 不支持安全保存密钥');
      await this.credentials.save(key,model);
      if(key.trim())this.key=key.trim();this.model=model.trim();this.credentialError='';this.providersChanged();
    },clear:async()=>{await this.credentials?.clear();this.key='';this.credentialError='';},test:()=>this.client.testConnection(),appearance:this.appearanceAPI(),web:this.webAPI(),chatgpt:this.chatGPTAPI(),bind:container=>root.ZMASettings.bind(container,this.settingsAPI())};}
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
    async selectionQuoteSource(reader,snapshot){return {...this.scope(reader),annotationKey:'SELECT23',pageIndex:snapshot.position.pageIndex,pageLabel:snapshot.pageLabel,rects:snapshot.position.rects.map(r=>r.slice()),nextPageRects:snapshot.position.nextPageRects?.map(r=>r.slice()),kind:'text',text:snapshot.text,selection:true,fingerprint:await this.fingerprint(reader)};}
    referenceTargets(reader,exclude){
      return (this.Z.Items.get(Number(reader.itemID)).getAnnotations()||[]).filter(a=>a.key!==exclude&&!a.deleted&&a.isEditable?.()!==false).map(a=>({annotationKey:a.key,label:`第 ${a.annotationPageLabel||'?'} 页 · ${String(a.annotationComment||a.annotationText||'空批注').replace(/<[^>]*>/g,'').slice(0,65)}`}));
    }
    onViewMenu=({reader,params,append})=>{
      if(!this.isPDF(reader))return;const snapshot=this.selectionSnapshot(reader,params);if(!snapshot)return;
      const disabled=this.isReadOnly(reader);
      append({label:'批注并提问（选中文字）',disabled:false,onCommand:()=>this.guard(async()=>{const panel=await this.panel(reader);try{await panel.addPDFQuote(await this.selectionQuoteSource(reader,snapshot));}catch(e){panel.error?.(e);}})});
      append({label:'引用选中文字到页边批注',disabled,onCommand:()=>this.guard(async()=>{const source=await this.saveSelection(reader,snapshot),panel=await this.panel(reader);await panel.markSource(source,true);})});
      append({label:'标记选中文字为引用来源',disabled,onCommand:()=>this.guard(async()=>{const source=await this.saveSelection(reader,snapshot),panel=await this.panel(reader);await panel.markSource(source);})});
      append({label:'向 DeepSeek 提问（选中文字）',disabled,onCommand:()=>this.guard(async()=>{const panel=await this.panel(reader);panel.showChat();try{await panel.addMaterial(()=>this.saveSelection(reader,snapshot));}catch(e){panel.error(e);}})});
    };
    onToolbar=event=>{
      if(!this.isPDF(event.reader))return;
      const reader=event.reader;const b=root.ZMAPanel.button(event.doc,'DeepSeek / ChatGPT',async()=>{const panel=await this.panel(reader);panel.showChat();});b.className='zma-toolbar';b.title='打开 DeepSeek / ChatGPT 文档提问侧边栏';event.append(b);
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
      append({label:'批注并提问',disabled:!region,onCommand:()=>this.guard(async()=>{const panel=await this.panel(reader);try{await panel.addPDFQuote(await this.resolveSource(reader,key));}catch(e){panel.error(e);}})});
      append({label:'向 DeepSeek 提问',disabled:!region,onCommand:()=>this.guard(async()=>{const panel=await this.panel(reader);panel.showChat();try{await panel.addMaterial(()=>this.resolveSource(reader,key));}catch(e){panel.error(e);}})});
      append({label:'标记为引用来源',disabled:!region||item.isEditable?.()===false||this.isReadOnly(reader),onCommand:()=>this.guard(async()=>{const panel=await this.panel(reader);await panel.markSource(await this.resolveSource(reader,key));})});
      append({label:'插入前文引用',disabled:!item||item.isEditable?.()===false||this.isReadOnly(reader),onCommand:()=>this.guard(async()=>{const panel=await this.panel(reader);await panel.showDirectory({annotationKey:key});})});
    };
    isPDF(reader){return reader?.type==='pdf'||reader?._type==='pdf';}
    async start(){
      if(this.running)return;
      await this.restoreCredentials();
      try{await this.auth?.load();}catch{this.authError='ChatGPT 登录信息无法读取，请在设置中重新登录。';}
      this.running=true;for(const win of this.Z.getMainWindows?.()||[this.win])this.bindHistoryPane(win);
      this.Z.Reader.registerEventListener('renderToolbar',this.onToolbar,ID);this.Z.Reader.registerEventListener('createAnnotationContextMenu',this.onMenu,ID);
      this.Z.Reader.registerEventListener('createViewContextMenu',this.onViewMenu,ID);
      for(const doc of this.addon.controller.preferenceDocuments||[])this.bindPreferencePaneWindow(doc.defaultView);
      this.observer=this.Z.Notifier.registerObserver({notify:(_event,type)=>{this.prune();if(type==='item')this.refreshReferenceCards(undefined,true);if(type==='tab')this.restoreReaders();}},['tab','item'],ID);
      this.restoreReaders();
    }
    async closeReader(reader){this.closedReaders.add(reader);for(const [doc,entry]of this.toolbarObservers)if(entry.reader===reader){entry.observer.disconnect();this.toolbarObservers.delete(doc);}const panel=this.panels.get(reader);this.panels.delete(reader);for(const [doc,entry]of this.cleanups)if(entry.reader===reader){entry.dispose();this.cleanups.delete(doc);}if(panel)await panel.destroy();}
    prune(){const live=new Set(this.Z.Reader._readers||[]);const readers=new Set([...this.panels.keys(),...[...this.cleanups.values()].map(x=>x.reader)]);for(const reader of readers)if(!live.has(reader))void this.closeReader(reader);}
    async stop(){
      this.running=false;this.key='';for(const panel of this.panels.values())panel.controller?.abort();await this.auth?.stop();this.providerListeners.clear();this.appearanceListeners.clear();this.Z.Reader._unregisterEventListenerByPluginID?.(ID);if(this.observer)this.Z.Notifier.unregisterObserver(this.observer);
      for(const win of [...this.historyPanes.keys()])this.unbindHistoryPane(win);
      for(const {observer}of this.toolbarObservers.values())observer.disconnect();this.toolbarObservers.clear();
      await Promise.allSettled(this.pending.values());await Promise.allSettled([...this.panels.values()].map(p=>p.destroy()));this.panels.clear();
      for(const entry of this.cleanups.values())entry.dispose();this.cleanups.clear();this.cache.clear();this.documents.clear();this.pdfFiles.clear();
      this.states.clear();this.activeRequests.clear();
      for(const win of this.settingsWindows)win.close();this.settingsWindows.clear();
      for(const reader of this.Z.Reader._readers||[])reader._iframeWindow?.document.querySelectorAll('.zma-toolbar,#zma-styles,#zma-math-styles').forEach(n=>n.remove());
      await this.store.flush();
    }
  }
  root.ZMAHost={Host};if(typeof module!=='undefined')module.exports=root.ZMAHost;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
