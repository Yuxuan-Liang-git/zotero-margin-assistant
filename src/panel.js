(function(root){
  'use strict';
  const C=root.ZMACore,D=root.ZMADeepSeek;
  function el(doc,tag,text,className){const node=doc.createElementNS('http://www.w3.org/1999/xhtml',tag);if(text!==undefined)node.textContent=text;if(className)node.setAttribute('class',className);
    // Zotero 10's focus manager exempts [contenteditable] by attribute presence.
    // Keep that marker false: the textarea owns editing and caret painting,
    // without also creating an outer contenteditable editing host in Gecko.
    if(tag==='textarea')node.setAttribute('contenteditable','false');return node;}
  function button(doc,label,action){const b=el(doc,'button',label);b.type='button';b.addEventListener('click',()=>Promise.resolve().then(action).catch(e=>doc.defaultView?.alert?.(e.message)));return b;}
  function iconButton(doc,label,kind,action){
    const b=button(doc,label,action),svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),path=doc.createElementNS('http://www.w3.org/2000/svg','path'),icons={new:'M8 3v10M3 8h10',history:'M2 7a6 6 0 1 1 1 4M2 3v4h4M8 4v4l3 2',reference:'M2 3h4a3 3 0 0 1 2 1 3 3 0 0 1 2-1h4v10h-4a3 3 0 0 0-2 1 3 3 0 0 0-2-1H2zM8 4v10',settings:'M6 2h4l.5 2 2 .5 1.5 3-1.5 1.5.5 2-3 2L8 12l-2 1-3-2 .5-2L2 7.5l1.5-3 2-.5zM10 7.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0',close:'M4 4l8 8M12 4l-8 8',attach:'M5 9l5-5a2 2 0 0 1 3 3l-6 6a3.5 3.5 0 0 1-5-5l6-6',page:'M4 2h5l3 3v9H4zM9 2v4h3M6 9h4M6 11h4',send:'M8 13V3M3.5 7.5L8 3l4.5 4.5',stop:'M4 4h8v8H4z',copy:'M6 2h7v9h-3M3 5h7v9H3z',note:'M3 2h10v9l-3 3H3zM10 14v-3h3M5 5h6M5 8h5',comment:'M2 2h12v9H7l-4 3v-3H2zM5 5h6M5 8h4'};
    svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.5');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');path.setAttribute('d',icons[kind]||icons.new);svg.append(path);b.replaceChildren(svg);b.classList.add('zma-icon-button');b.setAttribute('aria-label',label);b.title=label;return b;
  }
  class QuoteBubbles{
    constructor(panel,composer){
      this.panel=panel;this.doc=panel.doc;this.active=null;this.timer=null;this.frame=null;
      this.tray=el(this.doc,'div',undefined,'zma-quote-tray');composer.prepend(this.tray);
      this.layer=el(this.doc,'div',undefined,'zma-quote-anchors');panel.node.append(this.layer);
      this.popover=el(this.doc,'section',undefined,'zma-quote-popover');this.popover.hidden=true;this.popover.setAttribute('role','dialog');this.popover.setAttribute('aria-label','引用批注');panel.node.append(this.popover);
      // Capture phase is needed because the reader clipboard guard stops bubbling.
      this.outside=event=>{if(this.active&&!this.popover.contains(event.target)&&!event.target.closest?.('.zma-quote-chip,.zma-quote-anchor'))this.collapse();};
      this.escape=event=>{if(this.active&&event.key==='Escape'){event.preventDefault();event.stopPropagation();this.collapse();panel.question.focus();}};
      this.layout=()=>{if(this.frame===null)this.frame=this.doc.defaultView.requestAnimationFrame(()=>{this.frame=null;this.position();});};
      this.outsideDocuments=new Set();this.bindOutsideDocuments();this.popover.addEventListener('keydown',this.escape);panel.messages.addEventListener('scroll',this.layout,{passive:true});this.doc.defaultView.addEventListener('resize',this.layout);
      const Observer=this.doc.defaultView.ResizeObserver;this.observer=Observer?new Observer(this.layout):null;this.observer?.observe(panel.node);this.observer?.observe(this.popover);this.render();
    }
    records(){return this.panel.conversation().draftQuotes||[];}
    async attachPDF(adapter){
      if(!adapter?.page||this.pdf?.adapter===adapter)return;this.detachPDF();const doc=adapter.document();this.panel.host.installStyles(doc);this.pdf={adapter,doc};
      this.pdfPortal=el(doc,'div',undefined,'zma-panel zma-pdf-quote-portal');this.pdfPortal.setAttribute('aria-label','PDF 批注提问');this.pdfLayer=el(doc,'div',undefined,'zma-quote-anchors');this.pdfPortal.append(this.pdfLayer);doc.body.append(this.pdfPortal);
      this.pdfMath=this.panel.host.addon.bridge.installMathResources?.(doc,()=>{});this.pdfClipboard=root.ZMAClipboard?.install(this.pdfPortal,{copy:text=>this.panel.host.copy(text),read:()=>this.panel.host.readClipboard?.(),onError:e=>this.panel.error(e)});
      this.bindOutsideDocuments(doc);doc.addEventListener('scroll',this.layout,true);doc.defaultView.addEventListener('resize',this.layout);const bus=adapter.pdfWindow?.PDFViewerApplication?.eventBus;this.pdfBus=bus;for(const name of ['pagerendered','scalechanging','rotationchanging','updateviewarea'])bus?.on?.(name,this.layout);this.render();
    }
    detachPDF(){if(!this.pdf)return;if(this.popover.parentElement===this.pdfPortal)this.panel.node.append(this.popover);this.pdf.doc.removeEventListener('scroll',this.layout,true);this.pdf.doc.defaultView.removeEventListener('resize',this.layout);for(const name of ['pagerendered','scalechanging','rotationchanging','updateviewarea'])this.pdfBus?.off?.(name,this.layout);this.pdfMath?.();this.pdfClipboard?.();this.pdfPortal.remove();this.pdf=null;this.pdfPortal=null;this.pdfLayer=null;}
    pdfRect(source){
      const page=this.pdf?.adapter.page(source.pageIndex);if(!page)return null;const r=page.element.getBoundingClientRect(),v=page.viewport,sx=r.width/v.width,sy=r.height/v.height,rects=source.rects.map(rect=>{if(v.convertToViewportPoint){const a=v.convertToViewportPoint(rect[0],rect[1]),b=v.convertToViewportPoint(rect[2],rect[3]);return [a[0],a[1],b[0],b[1]];}return v.convertToViewportRectangle(this.panel.host.cloneInto?.(rect,v)||rect);});return {left:r.left+Math.min(...rects.map(x=>Math.min(x[0],x[2])))*sx,right:r.left+Math.max(...rects.map(x=>Math.max(x[0],x[2])))*sx,top:r.top+Math.min(...rects.map(x=>Math.min(x[1],x[3])))*sy,bottom:r.top+Math.max(...rects.map(x=>Math.max(x[1],x[3])))*sy};
    }
    bindOutsideDocuments(doc=this.doc,depth=0){
      if(!this.outsideDocuments.has(doc)){doc.addEventListener('pointerdown',this.outside,true);this.outsideDocuments.add(doc);}
      if(depth>=4)return;for(const frame of doc.querySelectorAll('iframe')){try{if(frame.contentDocument)this.bindOutsideDocuments(frame.contentDocument,depth+1);}catch{/* Cross-origin frames do not expose their document. */}}
    }
    save(){clearTimeout(this.timer);this.timer=null;C.touchConversation(this.panel.conversation());void this.panel.persist().catch(e=>this.panel.error(e));}
    changed(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.save(),250);}
    add(text,anchor={}){
      const p=this.panel;if(p.busy||p.pendingMaterials.size)throw new Error('请等待当前操作完成再引用');if(!text?.trim())throw new Error('请先选择对话片段');if(text.length>12000)throw new Error('所选内容过长，请缩小选择范围');
      this.collapse();const chat=p.conversation(),index=Number.isSafeInteger(anchor.messageIndex)?anchor.messageIndex:chat.history.length-1;
      if(!anchor.source&&(index<0||index>=chat.history.length))throw new Error('请在对话消息中重新选择片段');if(this.records().length>=20)throw new Error('每次最多添加 20 条批注，请先发送或移除部分批注');
      const q={id:`quote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`,text,comment:'',...(anchor.source?{source:C.pickSource(anchor.source)}:{messageIndex:index,...(Number.isSafeInteger(anchor.start)&&Number.isSafeInteger(anchor.end)?{start:anchor.start,end:anchor.end}:{})})};chat.draftQuotes=[...this.records(),q];this.render();this.open(q.id);
    }
    open(id){
      if(this.panel.busy)throw new Error('请等待回答完成后再编辑批注');if(this.active===id){this.collapse();return;}this.collapse();const q=this.records().find(q=>q.id===id);if(!q)return;this.active=id;this.bindOutsideDocuments();
      const inPDF=!!(q.source&&this.pdfPortal);(inPDF?this.pdfPortal:this.panel.node).append(this.popover);if(inPDF){const r=this.pdfRect(q.source);if(!r||r.bottom<0||r.top>this.pdf.doc.defaultView.innerHeight)this.panel.host.jump(this.panel.reader,{...q.source,fullPage:true});}
      const header=el(this.doc,'header'),number=this.records().indexOf(q)+1;header.append(el(this.doc,'strong',`批注 ${number}`),iconButton(this.doc,'收起批注','close',()=>this.collapse()));
      const quote=el(this.doc,'blockquote',undefined,'zma-quote-preview');this.panel.host.addon.bridge.renderMathPreview(quote,q.text);
      if(q.source&&q.source.kind!=='text'){const img=el(this.doc,'img');img.alt=`PDF 第 ${q.source.pageLabel} 页批注区域`;quote.append(img);this.panel.host.capture(this.panel.reader,q.source).then(m=>{if(img.isConnected){img.src=m.dataURL;this.layout();}}).catch(e=>{if(img.isConnected){img.replaceWith(el(this.doc,'small',e.message,'zma-invalid'));this.layout();}});}
      const input=el(this.doc,'textarea');input.setAttribute('aria-label','对话片段的注释');input.placeholder='写下对这段内容的疑问或批注…';input.maxLength=4000;input.value=q.comment;input.addEventListener('input',()=>{if(input.value.length>4000)input.value=input.value.slice(0,4000).replace(/[\uD800-\uDBFF]$/,'');q.comment=input.value;this.changed();});
      const footer=el(this.doc,'div',undefined,'zma-quote-footer');footer.append(el(this.doc,'small','随问题一起发送'),button(this.doc,'删除批注',()=>this.remove(id)));
      this.popover.replaceChildren(header,quote,input,footer);this.popover.hidden=false;this.position();input.focus();
    }
    collapse(){
      if(!this.active)return;const id=this.active,q=this.records().find(q=>q.id===id);this.active=null;this.popover.hidden=true;this.popover.replaceChildren();if(q&&!q.comment.trim())this.panel.conversation().draftQuotes=this.records().filter(q=>q.id!==id);this.save();this.render();
    }
    remove(id){if(this.panel.busy)throw new Error('请等待回答完成后再删除批注');this.active=null;this.popover.hidden=true;this.popover.replaceChildren();this.panel.conversation().draftQuotes=this.records().filter(q=>q.id!==id);this.save();this.render();}
    render(){
      this.tray.replaceChildren();this.layer.replaceChildren();this.pdfLayer?.replaceChildren();const records=this.records();this.tray.hidden=!records.length;this.panel.messages.classList.toggle('zma-has-quotes',records.some(q=>!q.source));
      records.forEach((q,i)=>{const chip=button(this.doc,`◦ ${i+1}`,()=>this.open(q.id));chip.className='zma-quote-chip';chip.dataset.quoteId=q.id;chip.setAttribute('aria-label',`编辑批注 ${i+1}`);chip.title=q.comment||q.text;chip.disabled=this.panel.busy;this.tray.append(chip);
        const badge=iconButton(this.doc,`打开批注 ${i+1}`,'comment',()=>this.open(q.id));badge.classList.add('zma-quote-anchor');badge.dataset.quoteId=q.id;badge.dataset.number=String(i+1);badge.title=`批注 ${i+1}：${q.comment||q.text}`;badge.disabled=this.panel.busy;if(q.source){badge.classList.add('zma-pdf-quote-anchor');this.pdfLayer?.append(badge);}else this.layer.append(badge);
      });this.layout();
    }
    rangeRect(q,answer){
      if(!Number.isSafeInteger(q.start)||!Number.isSafeInteger(q.end))return answer.getBoundingClientRect();
      const walker=this.doc.createTreeWalker(answer,4);let node,offset=0,start,end;
      while((node=walker.nextNode())){const length=node.textContent.length;if(!start&&q.start<=offset+length)start={node,offset:q.start-offset};if(q.end<=offset+length){end={node,offset:q.end-offset};break;}offset+=length;}
      if(!start||!end)return answer.getBoundingClientRect();const range=this.doc.createRange();range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);const rects=range.getClientRects();return rects.length?rects[rects.length-1]:answer.getBoundingClientRect();
    }
    position(){
      if(this.pdfPortal){this.pdfPortal.hidden=this.panel.node.hidden||this.panel.chat.hidden;this.pdfPortal.style.setProperty('--zma-font-size',`${this.panel.host.appearanceState?.().fontSize||14}px`);}if(this.panel.destroyed||this.panel.node.hidden)return;const root=this.panel.node.getBoundingClientRect(),view=this.panel.messages.getBoundingClientRect(),used=[];
      if(this.pdfLayer){const win=this.pdf.doc.defaultView,usedPDF=[];for(const badge of this.pdfLayer.querySelectorAll('button')){const q=this.records().find(q=>q.id===badge.dataset.quoteId),r=q&&this.pdfRect(q.source);badge.hidden=!r||r.bottom<0||r.top>win.innerHeight||r.right<0||r.left>win.innerWidth;if(!badge.hidden){let top=Math.max(4,r.top);while(usedPDF.some(y=>Math.abs(y-top)<25))top+=26;usedPDF.push(top);badge.style.top=`${Math.min(win.innerHeight-28,top)}px`;badge.style.left=`${Math.max(4,Math.min(win.innerWidth-28,r.right+4))}px`;}}}
      for(const badge of this.layer.querySelectorAll('button')){const q=this.records().find(q=>q.id===badge.dataset.quoteId),answer=q&&this.panel.messages.querySelector(`[data-message-index="${q.messageIndex}"] .zma-answer`);if(!answer){badge.hidden=true;continue;}const rect=this.rangeRect(q,answer);let top=Math.max(view.top,rect.bottom-24);while(used.some(y=>Math.abs(y-top)<25))top+=26;badge.hidden=top+24>view.bottom||rect.bottom<view.top||rect.top>view.bottom;if(!badge.hidden){used.push(top);badge.style.top=`${top-root.top}px`;badge.style.left=`${view.right-root.left-26}px`;}}
      if(!this.active||this.popover.hidden)return;const q=this.records().find(q=>q.id===this.active),inPDF=!!(q?.source&&this.pdfPortal),bounds=inPDF?this.pdfPortal.getBoundingClientRect():root,layer=inPDF?this.pdfLayer:this.layer,anchor=[...layer.children].find(n=>n.dataset.quoteId===this.active&&!n.hidden)||(inPDF?null:[...this.tray.children].find(n=>n.dataset.quoteId===this.active)),a=anchor?anchor.getBoundingClientRect():(inPDF?{top:50,bottom:80,right:bounds.width/2}:view),w=this.popover.offsetWidth,h=this.popover.offsetHeight;this.popover.style.left=`${Math.max(10,Math.min(bounds.width-w-10,a.right-bounds.left-w))}px`;const below=a.bottom-bounds.top+8;this.popover.style.top=`${Math.max(44,Math.min(bounds.height-h-10,below+h<bounds.height?below:a.top-bounds.top-h-8))}px`;
    }
    question(text){const records=this.records().filter(q=>q.comment.trim());return [text,...records.map((q,i)=>`【${q.source?'PDF':'对话'}批注 ${i+1}${q.source?' · PDF 第 '+q.source.pageLabel+' 页':''}】\n引用${q.source?'快照':''}：\n${q.text}\n\n我的批注／问题：\n${q.comment.trim()}`)].filter(Boolean).join('\n\n');}
    clear(){this.active=null;this.popover.hidden=true;this.popover.replaceChildren();this.panel.conversation().draftQuotes=[];this.render();}
    destroy(){this.collapse();this.detachPDF();clearTimeout(this.timer);for(const doc of this.outsideDocuments)doc.removeEventListener('pointerdown',this.outside,true);this.outsideDocuments.clear();this.popover.removeEventListener('keydown',this.escape);this.panel.messages.removeEventListener('scroll',this.layout);this.doc.defaultView.removeEventListener('resize',this.layout);this.observer?.disconnect();if(this.frame!==null)this.doc.defaultView.cancelAnimationFrame(this.frame);}
  }
  class Panel{
    /** @type {(()=>void)|undefined} */
    disposeMath;
    /** @type {(()=>void)|undefined} */
    disposeClipboard;
    /** @type {(()=>void)|undefined} */
    disposeComposerResize;
    /** @type {number|undefined} */
    composerHeight;
    constructor(host,reader,doc){this.host=host;this.reader=reader;this.doc=doc;this.materials=[];this.pendingMaterials=new Set();this.destroyed=false;this.busy=false;this.relinkID=null;this.webSignatures=new WeakMap();}
    async init(){
      this.state=await this.host.load(this.reader);this.conversationId=this.state.activeConversationId;const d=this.doc;
      this.node=el(d,'aside',undefined,'zma-panel');this.node.setAttribute('aria-label','区域阅读助手');this.node.hidden=true;
      const header=el(d,'header',undefined,'zma-header'),tools=el(d,'nav',undefined,'zma-header-actions');header.append(el(d,'strong','文档助手','zma-heading'),tools);
      this.historyButton=iconButton(d,'对话记录','history',()=>this.conversationList.hidden?this.showConversations():this.showChat());this.referenceButton=iconButton(d,'引用目录','reference',()=>this.directory.hidden?this.showDirectory():this.showChat());
      this.newButton=iconButton(d,'新会话','new',()=>this.newConversation());tools.append(this.newButton,this.historyButton,this.referenceButton,iconButton(d,'设置','settings',()=>this.host.settings()),iconButton(d,'关闭','close',()=>this.close()));
      this.chat=el(d,'section');this.directory=el(d,'section');this.directory.hidden=true;this.conversationList=el(d,'section',undefined,'zma-conversations');this.conversationList.hidden=true;
      this.activeLabel=el(d,'strong',undefined,'zma-active-conversation');
      this.materialList=el(d,'div',undefined,'zma-materials');
      this.messages=el(d,'div',undefined,'zma-messages');
      this.question=el(d,'textarea');this.question.dataset.zma='question';this.question.placeholder='询问这篇文献，或粘贴图片与附件…';this.question.setAttribute('aria-label','问题');this.question.value=this.conversation().draft;
      this.question.addEventListener('input',()=>{const conversation=this.conversation();conversation.draft=this.question.value;C.touchConversation(conversation);clearTimeout(this.draftTimer);this.draftTimer=setTimeout(()=>this.persist().catch(e=>this.error(e)),500);});
      this.question.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey||e.isComposing||e.keyCode===229)return;e.preventDefault();if(!this.busy)void this.send().catch(error=>this.error(error));});
      this.sendButton=iconButton(d,'发送','send',()=>this.send());this.sendButton.dataset.zma='send';this.sendButton.classList.add('zma-send');
      this.stopButton=iconButton(d,'停止生成','stop',()=>this.controller?.abort());this.stopButton.disabled=true;this.stopButton.classList.add('zma-stop');
      this.modelBadge=el(d,'span',undefined,'zma-model-badge');const actions=el(d,'div',undefined,'zma-composer-actions');actions.append(iconButton(d,'添加附件','attach',async()=>this.addFiles(await this.host.chooseAttachments())),iconButton(d,'添加当前页','page',()=>this.addMaterial(()=>this.host.currentPage(this.reader))),this.modelBadge,this.sendButton,this.stopButton);
      this.contextInfo=el(d,'p','文档背景：自动使用当前 PDF。','zma-context-info');
      this.contextDetails=el(d,'details',undefined,'zma-context');this.contextSummary=el(d,'summary','当前 PDF · 自动读取');this.contextDetails.append(this.contextSummary,this.contextInfo);
      this.status=el(d,'p','Enter 发送 · Shift+Enter 换行','zma-status');this.status.setAttribute('role','status');
      const composer=el(d,'div',undefined,'zma-composer');composer.append(this.question,actions);this.chat.className='zma-chat';this.chat.append(this.activeLabel,this.contextDetails,this.messages,this.materialList,composer);
      this.installComposerResize(composer);
      this.previewArea=el(d,'section',undefined,'zma-previews');
      this.node.append(header,this.previewArea,this.chat,this.conversationList,this.directory,this.status);d.body.append(this.node);
      this.node.addEventListener('click',event=>{const href=event.target.closest?.('a')?.getAttribute('href');if(/^https?:\/\//i.test(href||'')&&this.host.openExternal){event.preventDefault();event.stopPropagation();this.host.openExternal(href);}});
      this.quotes=new QuoteBubbles(this,composer);
      this.directory.className='zma-directory';this.installResizeHandle();
      this.disposeClipboard=root.ZMAClipboard?.install(this.node,{copy:text=>this.host.copy(text),read:()=>this.host.readClipboard?.(),readFiles:()=>this.host.readAttachmentClipboard?.()||[],onFiles:files=>this.addFiles(files),onQuote:(text,anchor)=>this.quoteSelection(text,anchor),onError:error=>this.error(error)});
      this.question.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();event.stopPropagation();}});this.question.addEventListener('drop',event=>{if(event.dataTransfer?.files.length){event.preventDefault();event.stopPropagation();void this.addFiles(Array.from(event.dataTransfer.files)).catch(e=>this.error(e));}});
      this.transfer=root.ZMATransferUI?new root.ZMATransferUI.TransferUI(this):null;
      this.applyAppearance();this.refreshProvider();this.renderMaterials();this.renderMessages();this.renderConversationList();return this;
    }
    refreshProvider(){
      const state=this.host.providerState?.()||{provider:'deepseek',model:this.host.model||''},model=state.models?.find(m=>m.slug===state.model)?.displayName||state.model||'';
      this.modelBadge.textContent=state.provider==='chatgpt'?(state.signedIn?'ChatGPT'+(model?' · '+model:''):'ChatGPT · 请到设置登录'):'DeepSeek'+(model?' · '+model:'');this.modelBadge.title=this.modelBadge.textContent+'；模型、账户与生成选项在设置中调整';this.sendButton.hidden=this.busy;this.stopButton.hidden=!this.busy;this.newButton.disabled=this.busy;this.quotes?.render();
    }
    applyAppearance(){this.node.style.setProperty('--zma-font-size',`${this.host.appearanceState?.().fontSize||14}px`);this.fitComposer?.();this.quotes?.layout();}
    installComposerResize(composer){
      const win=this.doc.defaultView,handle=this.composerHandle=el(this.doc,'div',undefined,'zma-composer-resizer');
      handle.setAttribute('role','separator');handle.setAttribute('aria-label','调整输入框高度');handle.setAttribute('aria-orientation','horizontal');handle.tabIndex=0;handle.classList.add('focusable');handle.title='上下拖动调整输入框高度，可收起；双击或 Enter 恢复默认高度';composer.prepend(handle);
      const outerHeight=node=>{const style=win.getComputedStyle(node);return node.getBoundingClientRect().height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);};
      const defaultHeight=()=>Math.ceil(Math.max(72,(parseFloat(win.getComputedStyle(this.question).fontSize)||14)*3.6));
      const limits=()=>{const min=0,occupied=[this.activeLabel,this.contextDetails,this.materialList].reduce((sum,node)=>sum+outerHeight(node),0),chrome=outerHeight(composer)-this.question.getBoundingClientRect().height;return {min,max:Math.max(min,Math.floor(Math.min(this.chat.clientHeight*.6,this.chat.clientHeight-occupied-chrome-80)))};};
      const setHeight=height=>{if(this.destroyed||this.node.hidden||this.chat.hidden)return;if(height>0)composer.classList.remove('zma-composer-collapsed');const {min,max}=limits(),value=Math.round(Math.max(min,Math.min(max,height)));this.composerHeight=value;this.question.style.height=`${value}px`;composer.classList.toggle('zma-composer-collapsed',value===0);handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(max));handle.setAttribute('aria-valuenow',String(value));handle.setAttribute('aria-expanded',String(value>0));};
      this.fitComposer=()=>setHeight(this.composerHeight??defaultHeight());
      const reset=event=>{event.preventDefault();event.stopPropagation();setHeight(defaultHeight());if(this.composerHeight>0)this.question.focus();};handle.addEventListener('dblclick',reset);
      let drag=null;
      const move=event=>{if(drag&&event.pointerId===drag.id)setHeight(drag.height+drag.y-event.clientY);};
      const end=event=>{if(!drag||event.pointerId!==drag.id)return;if(event.type==='pointerup')move(event);const id=drag.id;drag=null;handle.classList.remove('zma-dragging');try{if(handle.hasPointerCapture?.(id))handle.releasePointerCapture(id);}catch{/* Native cancellation can release capture first. */}};
      handle.addEventListener('pointerdown',event=>{if(event.button!==0||drag)return;event.preventDefault();event.stopPropagation();drag={id:event.pointerId,y:event.clientY,height:this.question.getBoundingClientRect().height};handle.classList.add('zma-dragging');try{handle.setPointerCapture?.(event.pointerId);}catch{/* Synthetic native QA events have no active pointer. */}});
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);
      handle.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','Home','End','Enter'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey)return;if(event.key==='Enter'){reset(event);return;}event.preventDefault();event.stopPropagation();if(event.key==='End')composer.classList.remove('zma-composer-collapsed');const {min,max}=limits(),height=this.question.getBoundingClientRect().height;setHeight(event.key==='Home'?min:event.key==='End'?max:height+(event.key==='ArrowUp'?1:-1)*(event.shiftKey?40:16));});
      win.addEventListener('resize',this.fitComposer);const observer=win.ResizeObserver?new win.ResizeObserver(this.fitComposer):null;observer?.observe(this.chat);
      this.disposeComposerResize=()=>{drag=null;observer?.disconnect();win.removeEventListener('resize',this.fitComposer);};
    }
    installResizeHandle(){
      const handle=el(this.doc,'div',undefined,'zma-resizer');handle.setAttribute('role','separator');handle.setAttribute('aria-label','调整文档助手宽度');handle.setAttribute('aria-orientation','vertical');this.node.prepend(handle);
      let dragging=false;const resize=e=>{if(!dragging)return;const viewport=this.doc.defaultView.innerWidth,width=Math.max(280,Math.min(viewport*.55,viewport-e.clientX));this.doc.documentElement.style.setProperty('--zma-assistant-user-width',`${width}px`);};
      handle.addEventListener('pointerdown',e=>{dragging=true;handle.setPointerCapture?.(e.pointerId);e.preventDefault();});handle.addEventListener('pointermove',resize);handle.addEventListener('pointerup',e=>{resize(e);dragging=false;handle.releasePointerCapture?.(e.pointerId);});handle.addEventListener('pointercancel',()=>{dragging=false;});
    }
    open(){this.node.hidden=false;this.doc.body.classList.add('zma-assistant-open');this.quotes?.layout();}
    close(){this.quotes?.collapse();this.node.hidden=true;if(this.quotes?.pdfPortal)this.quotes.pdfPortal.hidden=true;this.doc.body.classList.remove('zma-assistant-open');}
    conversation(){return C.activeConversation(this.state,this.conversationId);}
    showChat(){this.open();this.chat.hidden=false;this.directory.hidden=true;this.conversationList.hidden=true;this.fitComposer?.();this.historyButton.setAttribute('aria-pressed','false');this.referenceButton.setAttribute('aria-pressed','false');}
    showConversations(){this.quotes.collapse();this.open();this.chat.hidden=true;this.directory.hidden=true;this.conversationList.hidden=false;this.historyButton.setAttribute('aria-pressed','true');this.referenceButton.setAttribute('aria-pressed','false');this.renderConversationList();this.quotes.layout();}
    renderConversationList(){
      this.conversationList.replaceChildren(button(this.doc,'新会话',()=>this.newConversation()));
      if(this.transfer)this.conversationList.append(button(this.doc,'导入对话',()=>this.transfer.open()));
      for(const conversation of [...this.state.conversations].sort((a,b)=>b.updatedAt-a.updatedAt)){
        const row=el(this.doc,'div',undefined,'zma-conversation-row');
        if(conversation.id===this.conversationId)row.classList.add('zma-current');
        const label=conversation.title||'新对话';
        const open=button(this.doc,label,()=>this.switchConversation(conversation.id));open.title=label;
        row.append(open,el(this.doc,'small',conversation.updatedAt?new Date(conversation.updatedAt).toLocaleString():'旧版对话'));
        if(this.transfer){const exports=el(this.doc,'div',undefined,'zma-transfer-exports');exports.append(button(this.doc,'导出 JSON',()=>this.transfer.exportConversation(conversation.id,'json')),button(this.doc,'导出 Markdown',()=>this.transfer.exportConversation(conversation.id,'md')));row.append(exports);}
        this.conversationList.append(row);
      }
    }
    async switchConversation(id){
      if(this.busy||this.pendingMaterials.size||this.host.isGenerating?.(this.reader))throw new Error('请先等待当前操作完成');
      this.quotes.collapse();C.selectConversation(this.state,id);this.conversationId=id;this.materials=[];this.question.value=this.conversation().draft;
      this.contextInfo.textContent='文档背景：自动使用当前 PDF。';this.contextSummary.textContent='当前 PDF · 自动读取';this.contextDetails.open=false;this.renderMaterials();this.renderMessages();this.renderConversationList();this.showChat();await this.persist();
    }
    async commitImport(prepared){
      if(this.busy||this.pendingMaterials.size||this.host.isGenerating?.(this.reader)||this.destroyed)throw new Error('请先等待当前操作完成');
      this.quotes.collapse();clearTimeout(this.draftTimer);this.busy=true;this.refreshProvider();
      this.importTask=(async()=>{const conversation=await this.host.importConversation(this.reader,prepared);this.conversationId=conversation.id;if(this.destroyed)return;this.materials=[];this.question.value=this.conversation().draft;this.contextInfo.textContent='文档背景：自动使用当前 PDF。导入的问答作为历史；原上传附件需重新添加。';this.contextSummary.textContent='当前 PDF · 自动读取';this.renderMaterials();this.renderMessages();this.renderConversationList();this.showChat();this.status.textContent='对话已导入，可结合当前 PDF 继续提问。';})();
      try{await this.importTask;}finally{this.busy=false;if(!this.destroyed)this.refreshProvider();}
    }
    async newConversation(){
      if(this.busy||this.pendingMaterials.size||this.host.isGenerating?.(this.reader))throw new Error('请先等待当前操作完成');
      const current=this.conversation();
      this.quotes.collapse();const next=current.history.length||current.draft.trim()||current.draftAttachments?.length||current.draftQuotes?.length?C.createConversation(this.state):current;
      await this.switchConversation(next.id);this.question.focus();
    }
    error(e){if(!this.destroyed)this.status.textContent=e.message||String(e);}
    async persist(){if(this.destroyed)return;await this.host.save(this.reader,this.state);}
    async addMaterial(source){
      this.showChat();this.status.textContent='正在读取所选材料…';
      if(this.busy||this.host.isGenerating?.(this.reader))throw new Error('生成期间不能更改材料');
      const loader=typeof source==='function';let key=loader?Symbol('source-lookup'):`${source.annotationKey}:${source.pageIndex}`;
      if(!loader&&(this.pendingMaterials.has(key)||this.materials.some(m=>m.source.annotationKey===source.annotationKey&&m.source.pageIndex===source.pageIndex)))return;
      if(this.materials.length+(this.conversation().draftAttachments?.length||0)+this.pendingMaterials.size>=8)throw new Error('每次最多 8 个区域');
      this.pendingMaterials.add(key);this.sendButton.disabled=true;
      try{
        if(loader){source=await source();if(this.destroyed)return;const resolvedKey=`${source.annotationKey}:${source.pageIndex}`;this.pendingMaterials.delete(key);if(this.pendingMaterials.has(resolvedKey)||this.materials.some(m=>m.source.annotationKey===source.annotationKey&&m.source.pageIndex===source.pageIndex))return;key=resolvedKey;this.pendingMaterials.add(key);}
        if(this.busy||this.host.isGenerating?.(this.reader))throw new Error('生成期间不能更改材料');
        const material=await this.host.capture(this.reader,source);if(this.destroyed)return;
        if(this.busy||this.host.isGenerating?.(this.reader))throw new Error('生成期间不能更改材料');
        this.materials.push(material);this.showChat();this.renderMaterials();this.status.textContent='材料已加入，可输入问题或继续添加前文。';
      }finally{this.pendingMaterials.delete(key);if(!this.destroyed)this.sendButton.disabled=this.busy||this.pendingMaterials.size>0;}
    }
    quoteSelection(text,anchor={}){this.quotes.add(text,anchor);}
    async addPDFQuote(source){
      if(this.busy||this.pendingMaterials.size)throw new Error('请等待当前操作完成再添加 PDF 批注');const key=Symbol('pdf-quote');this.pendingMaterials.add(key);this.sendButton.disabled=true;
      try{const material=await this.host.capture(this.reader,source);if(this.destroyed)return;this.pendingMaterials.delete(key);this.showChat();this.quotes.add(material.text||`PDF 第 ${material.source.pageLabel} 页所选区域（截图）`,{source:material.source});}
      finally{this.pendingMaterials.delete(key);if(!this.destroyed)this.sendButton.disabled=this.busy||this.pendingMaterials.size>0;}
    }
    async addFiles(inputs){
      if(!inputs?.length)return;if(this.pendingMaterials.size)throw new Error('正在读取材料，请稍后再粘贴');if(this.busy||this.host.isGenerating?.(this.reader))throw new Error('请先等待生成完成再添加附件');
      const conversation=this.conversation(),key=Symbol('attachments');this.pendingMaterials.add(key);this.sendButton.disabled=true;this.status.textContent='正在保存附件…';
      try{for(const input of inputs){if(this.destroyed)return;const files=conversation.draftAttachments||[];if(files.length+this.materials.length>=8)throw new Error('每轮最多 8 个附件与区域材料');const record=await this.host.importAttachment(this.reader,input);if(this.destroyed)return;conversation.draftAttachments=[...files,record];C.touchConversation(conversation);await this.persist();this.renderMaterials();}this.showChat();this.status.textContent='附件已保存在本机，点击发送后提交。';}
      finally{this.pendingMaterials.delete(key);if(!this.destroyed){this.sendButton.disabled=this.busy||this.pendingMaterials.size>0;this.renderMaterials();}}
    }
    renderMaterials(){
      this.materialList.replaceChildren();
      for(const record of this.conversation().draftAttachments||[]){const row=el(this.doc,'div',undefined,'zma-material');row.append(el(this.doc,'small',`${record.name} · ${(record.size/1024).toFixed(1)} KiB`));const remove=button(this.doc,'移除附件',async()=>{if(this.busy||this.pendingMaterials.size)throw new Error('请等待当前操作完成');const chat=this.conversation();chat.draftAttachments=chat.draftAttachments.filter(a=>a.id!==record.id);await this.persist();this.renderMaterials();});remove.disabled=this.busy||this.pendingMaterials.size>0;row.append(remove);this.materialList.append(row);}
      for(const [i,m]of this.materials.entries()){
        const card=el(this.doc,'div',undefined,'zma-material');const label=`${m.source.type||'区域'} ${m.source.number||''} 第 ${m.source.pageLabel} 页`;
        const remove=button(this.doc,'移除',()=>{if(this.busy)throw new Error('请先停止生成');this.materials.splice(i,1);this.renderMaterials();});remove.disabled=this.busy;
        if(m.unavailable)card.append(el(this.doc,'small','来源已失效，本轮未发送。请移除后重新选择。','zma-invalid'));else if(m.source.kind==='text')card.append(el(this.doc,'blockquote',m.text,'zma-material-text'));else{const img=el(this.doc,'img');img.src=m.dataURL;img.alt=label;card.append(img);}card.append(el(this.doc,'small',label),remove);this.materialList.append(card);
      }
    }
    renderMessages(start){
      this.messages.replaceChildren();
      const conversation=this.conversation();this.activeLabel.textContent=`当前对话：${conversation.title||'新对话'}`;
      const first=Number.isSafeInteger(start)?Math.max(0,start):Math.max(0,conversation.history.length-20);
      if(first)this.messages.append(button(this.doc,'显示更早消息',()=>{const height=this.messages.scrollHeight,top=this.messages.scrollTop;this.renderMessages(Math.max(0,first-20));this.messages.scrollTop=this.messages.scrollHeight-height+top;}));
      conversation.history.slice(first).forEach((m,i)=>this.messages.append(this.messageCard(m,i+first)));
      if(!conversation.history.length)this.messages.append(el(this.doc,'p','直接问“当前这篇论文讲了什么”即可；助手会自动读取当前 PDF。也可框选内容或加入前文引用，进一步解释公式。','zma-empty-chat'));
      this.messages.scrollTop=this.messages.scrollHeight;this.quotes?.render();
    }
    messageCard(m,i){
      const card=el(this.doc,'article',undefined,`zma-message zma-${m.role}`);card.dataset.messageIndex=String(i);card.append(el(this.doc,'strong',m.role==='user'?'问题':m.incomplete?'回答（未完成）':'回答'));
      const text=el(this.doc,'div',undefined,'zma-answer');text.tabIndex=0;if(m.role==='assistant'){if(m.content)this.renderAnswer(text,this.citedAnswer(m));}else text.textContent=m.content;
      if(m.attachments?.length){const files=el(this.doc,'p',m.attachments.map(a=>a.name).join('、'),'zma-message-files');card.append(files);}
      if(m.pdfContext?.mode==='full-pdf')card.append(el(this.doc,'small',`本轮已附带完整 PDF：${m.pdfContext.fileName}（${m.pdfContext.totalPages} 页）`,'zma-message-files'));
      if(m.sourceWarnings?.length)card.append(el(this.doc,'small',m.sourceWarnings.join('\n'),'zma-invalid'));
      card.append(text);if(m.role==='assistant'){this.renderWeb(card,m);if(m.content)this.addAnswerActions(card,m,i);}return card;
    }
    citedAnswer(m){return root.ZMAWeb&&m.web?root.ZMAWeb.citedText(m.content,m.web):m.content;}
    answerExport(m){return this.citedAnswer(m)+(m.web?.images?.length?'\n\n网络配图来源：\n'+m.web.images.map(i=>`${i.caption}：${i.source}`).join('\n'):'');}
    renderWeb(card,m){
      const W=root.ZMAWeb;if(!W||!m.web)return;const data=W.clean(m.web),signature=JSON.stringify(data);if(this.webSignatures.get(card)===signature)return;this.webSignatures.set(card,signature);card.querySelector('.zma-web-result')?.remove();
      const section=el(this.doc,'section',undefined,'zma-web-result'),cited=W.citedSources(data),link=(url,title)=>{const a=el(this.doc,'a',title);a.href=url;a.rel='noopener noreferrer';return a;};
      if(data.used)section.append(el(this.doc,'small','本轮联网检索 · 外部补充资料','zma-web-label'));
      if(cited.length){const details=el(this.doc,'details'),summary=el(this.doc,'summary',`引用来源 · ${cited.length}`),list=el(this.doc,'ol');for(const s of cited){const li=el(this.doc,'li');li.append(link(s.url,s.title));list.append(li);}details.append(summary,list);section.append(details);}
      const other=data.sources.filter(s=>!cited.some(c=>c.url===s.url));if(other.length){const details=el(this.doc,'details'),list=el(this.doc,'ul');details.append(el(this.doc,'summary',`其他检索资料 · ${other.length}`));for(const s of other){const li=el(this.doc,'li');li.append(link(s.url,s.title));list.append(li);}details.append(list);section.append(details);}
      if(data.images.length){section.append(el(this.doc,'small','网络配图 · 外部来源，非当前论文原图','zma-web-label'));const gallery=el(this.doc,'div',undefined,'zma-web-images');for(const i of data.images){const figure=el(this.doc,'figure'),image=el(this.doc,'img'),caption=el(this.doc,'figcaption');image.alt=i.caption;image.loading='lazy';image.referrerPolicy='no-referrer';image.src=i.thumbnail||i.url;image.addEventListener('error',()=>{image.remove();figure.prepend(el(this.doc,'small','图片未能加载，请打开来源查看。'));},{once:true});caption.append(link(i.source,i.caption));figure.append(image,caption);gallery.append(figure);}section.append(gallery);}
      if(section.childNodes.length)card.insertBefore(section,card.querySelector('.zma-message-actions'));
    }
    addAnswerActions(card,m,i){
      const actions=el(this.doc,'div',undefined,'zma-actions zma-message-actions');actions.append(iconButton(this.doc,'复制','copy',()=>this.host.copy(this.answerExport(m))),iconButton(this.doc,'保存为笔记','note',()=>this.saveAnswer(i,'note')),iconButton(this.doc,'保存到批注','comment',()=>this.saveAnswer(i,'comment')));card.append(actions);
    }
    renderAnswer(node,text){if(root.ZMAMarkdown)root.ZMAMarkdown.render(node,text,this.host.addon.bridge.renderMathPreview);else this.host.addon.bridge.renderMathPreview(node,text);}
    async compactHistory(conversation,history,signal,client=this.host.client){
      const target=C.compactionTarget({...conversation,history});let through=conversation.compactedThrough||0;
      while(through<target){
        let end=through,characters=0;
        while(end<target&&end-through<24){
          const pair=history.slice(end,end+2),size=pair.reduce((n,m)=>n+m.content.length+(m.materials||[]).reduce((total,s)=>total+(s.text?.length||0),0),0);
          if(end>through&&characters+size>24000)break;
          characters+=size;end+=2;
        }
        if(end===through||history[through]?.role!=='user'||history[end-1]?.role!=='assistant')throw new Error('历史对话格式异常，无法安全压缩；原始记录未改变');
        if(!this.destroyed)this.status.textContent=`正在压缩较早对话：${end}/${target}…`;
        const summary=await client.summarize(conversation.summary||'',history.slice(through,end),{signal});
        if(!summary?.trim())throw new Error('历史对话摘要为空；原始记录未改变');
        conversation.summary=summary;conversation.compactedThrough=end;through=end;
      }
    }
    async send(){
      if(this.busy)return;if(this.pendingMaterials.size)throw new Error('材料正在读取，请完成后再发送');this.quotes.collapse();const draftQuestion=this.question.value.trim(),question=this.quotes.question(draftQuestion);if(!question)throw new Error('请输入问题');
      // A retry replaces the failed pair, rather than duplicating its user message.
      const conversation=this.conversation(),history=conversation.history.slice();
      const retry=history.at(-1)?.incomplete&&history.at(-2)?.role==='user'&&history.at(-2).content===question;
      if(retry)history.splice(-2);
      const client=this.host.selectedClient?.()||this.host.client,provider=this.host.provider,model=this.host.providerState?.().model,label=this.host.providerLabel?.()||'DeepSeek';
      const controller=this.host.newAbortController();this.host.claimRequest?.(this.reader);this.busy=true;this.refreshProvider();this.sendButton.disabled=true;this.stopButton.disabled=false;this.renderMaterials();this.status.textContent='准备来源…';
      this.controller=controller;const deadline=setTimeout(()=>this.controller?.abort(),300000);
      let user,answer,answerCard,readerMoved=false,unavailableCount=0;const currentWarnings=[];
      const sourceWarning=(source,historical)=>{unavailableCount++;return `${historical?'历史引用':'当前材料'}（PDF 第 ${source.pageIndex+1} 页）已失效，本轮未发送或读取；原记录保留，需重新选择后才能读取。`;};
      const canOmit=error=>!this.controller.signal.aborted&&['SOURCE_STALE','SOURCE_MISSING'].includes(error?.code);
      const readingEvents=['wheel','touchstart','pointerdown','keydown'];
      const reading=event=>{if(event.type==='keydown'&&!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))return;readerMoved=true;};
      for(const event of readingEvents)this.messages.addEventListener(event,reading,{passive:true});
      try{
        await this.compactHistory(conversation,history,this.controller.signal,client);
        const hydrated=[];
        for(const m of history.slice(conversation.compactedThrough||0)){
          if(m.role==='assistant'){hydrated.push(m);continue;}
          const materials=[],sourceWarnings=[...(m.sourceWarnings||[])];for(const s of m.materials||[]){try{materials.push(s.automaticPage?{source:s}:await this.host.capture(this.reader,s));}catch(e){if(!canOmit(e))throw e;sourceWarnings.push(sourceWarning(s,true));}}
          const attachments=[];for(const file of m.attachments||[])attachments.push(await this.host.loadAttachment(this.reader,file));hydrated.push({...m,materials,attachments,sourceWarnings});
        }
        const refreshed=[];for(const material of this.materials){try{refreshed.push(await this.host.capture(this.reader,material.source));delete material.unavailable;}catch(e){if(!canOmit(e))throw e;material.unavailable=true;currentWarnings.push(sourceWarning(material.source,false));}}this.renderMaterials();
        for(const [i,q]of (conversation.draftQuotes||[]).entries()){if(!q.source||!q.comment.trim())continue;try{const material=await this.host.capture(this.reader,q.source);if(!refreshed.some(m=>JSON.stringify(C.pickSource(m.source))===JSON.stringify(C.pickSource(material.source))))refreshed.push({...material,source:{...material.source,type:'PDF批注',number:String(i+1)}});}catch(e){if(!canOmit(e))throw e;currentWarnings.push(sourceWarning(q.source,false)+' 文字引用仅为先前选区快照。');}}
        const attachments=[];for(const file of conversation.draftAttachments||[])attachments.push(await this.host.loadAttachment(this.reader,file));
        if(this.host.provider==='deepseek'&&[...attachments,...hydrated.flatMap(m=>m.attachments||[])].some(a=>a.mime==='application/pdf'))throw new Error('PDF 附件当前请使用 ChatGPT；DeepSeek 可接收图片附件。');
        const baseMessages=D.buildMessages(hydrated,question,refreshed,undefined,conversation.summary||'',attachments,currentWarnings);
        const context=await this.host.documentContext?.(this.reader,question,{budget:Math.min(24000,58000-D.textSize(baseMessages)),imageLimit:Math.max(0,8-refreshed.length-attachments.length),imageBudget:Math.max(0,Math.min(4*1024*1024,12*1024*1024-JSON.stringify(baseMessages).length-100000)),preferPDFFile:provider==='chatgpt',signal:this.controller.signal,onProgress:(n,total)=>{if(!this.destroyed)this.status.textContent=`正在读取当前 PDF：${n}/${total} 页…`;}});
        const requestAttachments=D.contextAttachments(attachments,context,refreshed),submitted=D.contextMaterials(refreshed,context,requestAttachments),wholePDF=context?.mode==='full-pdf'&&requestAttachments.some(f=>f.dataURL===context.file?.dataURL);
        if(context&&!this.destroyed){const imagePages=submitted.filter(m=>m.source.fullPage).map(m=>m.source.pageIndex+1);this.contextInfo.textContent=wholePDF?`本轮使用：${context.title} · 已附带完整 PDF 文件（共 ${context.totalPages} 页，含正文与图像公式）`:(context.mode==='full-text'?`本轮使用：${context.title} · 完整文字层 ${context.totalPages} 页`:`本轮使用：${context.title} · ${context.mode==='current-page-image'?'无全文文字层':'相关文字节选'}（PDF 第 ${context.pages.join('、')} 页）`)+`；页面图片：${imagePages.length?'PDF 第 '+imagePages.join('、')+' 页':'未加入'}`+(context.scannedPages?.length?'；扫描页尚无全文识别索引':'')+(context.imageWarning?'；'+context.imageWarning:'');}
        if(context&&!this.destroyed){const images=submitted.filter(m=>m.source.fullPage).length;this.contextSummary.textContent=wholePDF?`完整 PDF · ${context.totalPages} 页`:context.mode==='full-text'?`文档文字层 · ${images} 页图像`:`文档节选 · ${images} 页图像`;const limited=!!context.imageWarning||unavailableCount>0;this.contextDetails.classList.toggle('zma-context-warning',limited);if(limited)this.contextSummary.textContent+=' · 部分材料未加入';}
        if(unavailableCount&&!this.destroyed)this.contextInfo.textContent+=`；${unavailableCount} 处引用已失效，本轮未发送，原记录保留`;
        const messages=D.buildMessages(hydrated,question,refreshed,context,conversation.summary||'',attachments,currentWarnings);
        if(this.controller.signal.aborted)throw new Error('生成已停止');
        user={role:'user',content:question,...(wholePDF?{pdfContext:{mode:'full-pdf',fileName:context.file.name,fileSize:context.file.size,totalPages:context.totalPages}}:{}),...(currentWarnings.length?{sourceWarnings:currentWarnings}:{}),...(attachments.length?{attachments:attachments.map(C.pickAttachment)}:{}),materials:submitted.map(m=>({...C.pickSource(m.source),type:m.source.type,number:m.source.number,description:m.source.description})),incomplete:false};
        answer={role:'assistant',content:'',materials:[],incomplete:true,...(provider?{provider,model}:{} )};
        conversation.history=[...history,user,answer];conversation.draft=this.question.value;C.touchConversation(conversation);await this.persist();
        if(retry){this.messages.lastElementChild?.remove();this.messages.lastElementChild?.remove();}
        this.messages.querySelector('.zma-empty-chat')?.remove();this.messages.append(this.messageCard(user,history.length),this.messageCard(answer,history.length+1));answerCard=this.messages.lastElementChild;this.messages.scrollTop=this.messages.scrollHeight;this.activeLabel.textContent=`当前对话：${conversation.title||'新对话'}`;this.renderConversationList();
        this.status.textContent=label+' 正在回答…';
        const streamText=this.messages.lastElementChild?.querySelector('.zma-answer');
        const streamNode=this.doc.createTextNode('');streamText?.append(streamNode);let lastScroll=0;
        this.liveRenderer=root.ZMAStreaming&&streamText?new root.ZMAStreaming.LiveRenderer(streamText,(node,value)=>this.renderAnswer(node,value),{before:()=>!readerMoved&&this.messages.scrollHeight-this.messages.scrollTop-this.messages.clientHeight<80,after:follow=>{if(follow&&!readerMoved&&!this.destroyed)this.messages.scrollTop=this.messages.scrollHeight;}}):null;
        /** @type {any} */
        let serviceTier;answer.content=await client.generate(messages,{signal:this.controller.signal,onServiceTier:info=>{serviceTier=info;},onWebUpdate:info=>{answer.web=root.ZMAWeb?.clean(info)||info;if(!this.destroyed){if(!answer.content)this.status.textContent='正在检索网络资料与配图…';if(!this.webRenderTimer)this.webRenderTimer=setTimeout(()=>{this.webRenderTimer=null;if(!this.destroyed&&answerCard)this.renderWeb(answerCard,answer);},200);}},onDelta:delta=>{
          answer.content+=delta;if(!this.destroyed){if(this.status.textContent==='正在检索网络资料与配图…')this.status.textContent=label+' 正在回答…';if(this.liveRenderer)this.liveRenderer.append(delta);else{const follow=!readerMoved&&this.messages.scrollHeight-this.messages.scrollTop-this.messages.clientHeight<80;streamNode.appendData(delta);const now=Date.now();if(follow&&now-lastScroll>=100){this.messages.scrollTop=this.messages.scrollHeight;lastScroll=now;}}}
        }});
        answer.incomplete=false;conversation.draftAttachments=[];this.renderMaterials();this.quotes.clear();if(this.question.value.trim()===draftQuestion)this.question.value='';conversation.draft=this.question.value;C.touchConversation(conversation);this.status.textContent='回答完成，可追问或保存。'+(unavailableCount?` ${unavailableCount} 处引用已失效，本轮未发送，原记录保留。`:'')+(serviceTier?(serviceTier.actual?` 本轮档位：${{default:'标准',fast:'快速 Fast',ultrafast:'极速 Ultrafast'}[serviceTier.actual]}${serviceTier.requested!==serviceTier.actual?'（与请求档位不同）':''}。`:' 已请求速度档位，服务端未确认实际档位。'):'');
      }catch(e){
        if(answer){answer.content=e.partial??answer.content;answer.incomplete=true;}
        conversation.draft=this.question.value;C.touchConversation(conversation);this.error(e);
        if(e.serverDetail&&answerCard&&!this.destroyed){const details=el(this.doc,'details',undefined,'zma-error-details');details.append(el(this.doc,'summary','服务端错误说明'),el(this.doc,'pre',e.serverDetail));answerCard.append(details);}
        if(e.diagnosticText&&answerCard&&!this.destroyed){const details=e.diagnosticText;const copyButton=button(this.doc,'复制错误诊断',()=>{this.host.copy(details);this.status.textContent='错误诊断已复制；如有服务端说明，已脱敏后附上。';});copyButton.className='zma-error-diagnostic';answerCard.append(copyButton);}
        if(provider==='chatgpt'&&e.status===400&&e.diagnostic?.request&&(e.diagnostic.request.serviceTier!=='default'||e.diagnostic.request.webSearch||e.diagnostic.request.reasoning!=='default')&&answerCard&&!this.destroyed){const retryButton=button(this.doc,'以标准模式关闭联网重试',async()=>{
          if(this.busy)return;if(this.host.provider!=='chatgpt'){this.status.textContent='当前服务已改变，请发送当前问题。';return;}
          await this.host.setChatGPTSpeed('default');await this.host.setChatGPTReasoning('default');await this.host.setWebMode('off');this.refreshProvider();
          if(this.conversation()!==conversation||this.quotes.question(this.question.value.trim())!==question){this.status.textContent='已设为标准速度、默认思考强度并关闭联网，请发送当前问题。';return;}
          await this.send();
        });retryButton.className='zma-retry-compatible';answerCard.append(retryButton);}
        if(e.reasoningRejected&&answerCard&&!this.destroyed){const retryButton=button(this.doc,'使用默认思考强度重试',async()=>{
          if(this.busy)return;await this.host.setChatGPTReasoning('default');this.refreshProvider();
          if(this.conversation()!==conversation||this.quotes.question(this.question.value.trim())!==question){this.status.textContent='已切换为模型默认思考强度，请发送当前问题。';return;}
          await this.send();
        });retryButton.className='zma-retry-reasoning';answerCard.append(retryButton);}
        if(e.webRejected&&answerCard&&!this.destroyed){const retryButton=button(this.doc,'关闭联网搜索并重试',async()=>{if(this.busy)return;await this.host.setWebMode('off');if(this.conversation()!==conversation||this.quotes.question(this.question.value.trim())!==question){this.status.textContent='联网搜索已关闭，请发送当前问题。';return;}await this.send();});retryButton.className='zma-retry-web';answerCard.append(retryButton);}
        if(e.speedRejected&&answerCard&&!this.destroyed){const retryButton=button(this.doc,'以标准模式重试',async()=>{
          if(this.busy)return;await this.host.setChatGPTSpeed('default');this.refreshProvider();
          if(this.conversation()!==conversation||this.quotes.question(this.question.value.trim())!==question){this.status.textContent='已切换为标准模式，请点击发送当前问题。';return;}
          await this.send();
        });retryButton.className='zma-retry-standard';answerCard.append(retryButton);}
      }finally{
        clearTimeout(this.webRenderTimer);this.webRenderTimer=null;
        for(const event of readingEvents)this.messages.removeEventListener(event,reading);
        this.liveRenderer?.finish();this.liveRenderer=null;clearTimeout(deadline);this.controller=null;this.busy=false;this.host.releaseRequest?.(this.reader);this.refreshProvider();
        if(!this.destroyed){this.sendButton.disabled=this.pendingMaterials.size>0;this.stopButton.disabled=true;this.renderMaterials();if(answerCard){const readingPosition=this.messages.scrollTop,selection=this.doc.defaultView.getSelection(),keepPosition=readerMoved||answer.incomplete||!!(selection&&!selection.isCollapsed&&(answerCard.contains(selection.anchorNode)||answerCard.contains(selection.focusNode)));const text=answerCard.querySelector('.zma-answer');if(text)this.renderAnswer(text,this.citedAnswer(answer));this.renderWeb(answerCard,answer);const label=answerCard.querySelector('strong');if(label)label.textContent=answer.incomplete?'回答（未完成）':'回答';if(answer.content)this.addAnswerActions(answerCard,answer,conversation.history.length-1);this.messages.scrollTop=keepPosition?readingPosition:Math.max(0,this.messages.scrollTop+answerCard.getBoundingClientRect().top-this.messages.getBoundingClientRect().top-this.messages.clientTop);}else if(answer)this.renderMessages();this.renderConversationList();await this.persist().catch(e=>this.error(e));}
      }
    }
    async saveAnswer(index,kind){
      if(this.busy)throw new Error('请先等待回答或停止生成');
      const history=this.conversation().history,answer=history[index],question=history[index-1];if(!answer?.content||question?.role!=='user')return;
      const doc=this.doc;const form=el(doc,'div',undefined,'zma-save-preview');
      const preview=el(doc,'textarea');preview.value=`问题：${question.content}\n\n${answer.incomplete?'[未完成回答]\n':''}${this.answerExport(answer)}`;
      preview.setAttribute('aria-label','保存内容预览');
      let target;
      form.append(el(doc,'strong','检查并编辑保存内容'),preview);
      if(kind==='comment'){
        target=el(doc,'select');for(const s of question.materials){if(s.fullPage||s.selection)continue;const option=el(doc,'option',`第 ${s.pageLabel} 页 · ${s.annotationKey}`);option.value=s.annotationKey;target.append(option);}form.append(target);
        if(!target.options.length)throw new Error('本次只有页面材料，没有可保存的区域批注；请选择保存为笔记');
      }
      const save=button(doc,'确认保存',async()=>{
        save.disabled=true;
        try{const sources=question.materials;
          if(kind==='note')await this.host.saveNote(this.reader,preview.value,sources);
          else await this.host.saveComment(this.reader,sources.find(s=>s.annotationKey===target.value),preview.value,sources);
          form.remove();this.status.textContent='已保存到 Zotero。';
        }catch(e){save.disabled=false;this.error(e);}
      });form.append(save,button(doc,'取消',()=>form.remove()));this.chat.append(form);preview.focus();
    }
    async markSource(source,direct=false){
      this.open();const doc=this.doc;const form=el(doc,'div',undefined,'zma-source-form');
      const number=el(doc,'input');number.placeholder='编号，例如 6.30';number.setAttribute('aria-label','来源编号');
      const type=el(doc,'select');C.TYPES.forEach(t=>type.append(el(doc,'option',t)));
      if(source.kind==='text')type.value='段落';
      const description=el(doc,'textarea');description.placeholder='可选说明';
      const prior=this.state.sources.find(s=>s.id===(this.relinkID||source.id));
      if(prior){number.value=prior.number;type.value=prior.type;description.value=prior.description;}
      const capture=await this.host.capture(this.reader,source);let content;if(source.kind==='text'){content=el(doc,'blockquote',undefined,'zma-reference-text');this.host.addon.bridge.renderMathPreview(content,capture.text);}else{content=el(doc,'img');content.src=capture.dataURL;content.alt='来源区域';}
      let target;
      form.append(el(doc,'strong',direct?'引用内容到页边批注':prior?'重新关联来源':'标记引用来源'),content,number,type,description);
      if(direct){target=el(doc,'select');target.setAttribute('aria-label','目标页边批注');const candidates=this.host.referenceTargets(this.reader,source.annotationKey);for(const a of candidates){const option=el(doc,'option',a.label);option.value=a.annotationKey;target.append(option);}if(!candidates.length)throw new Error('请先添加目标页边批注，再引用这段文字');form.append(el(doc,'p','选择要插入的页边批注：'),target);let n=1;while(this.state.sources.some(s=>s.number===`文字${n}`))n++;number.value=`文字${n}`;}
      form.append(button(doc,direct?'引用到此批注':'保存标记',async()=>{
        if(this.host.isReadOnly?.(this.reader))throw new Error('此文献库为只读');
        const idx=new C.ReferenceIndex(this.state.sources);const record={...source,number:number.value,type:type.value,description:description.value};
        const saved=idx.add({...record,...(prior?{id:prior.id}:{})});this.relinkID=null;
        await this.persist();if(direct)await this.host.insertReference(this.reader,{annotationKey:target.value},saved,this.state);
        form.remove();if(direct){this.close();this.status.textContent='引用内容已显示在目标页边批注。';}else await this.showDirectory();
      }),button(doc,'取消',()=>{form.remove();this.relinkID=null;}));this.node.append(form);number.focus();
    }
    async showDirectory(target){
      this.quotes.collapse();this.quotes.layout();
      this.open();this.chat.hidden=true;this.conversationList.hidden=true;this.directory.hidden=false;this.historyButton.setAttribute('aria-pressed','false');this.referenceButton.setAttribute('aria-pressed','true');this.directory.replaceChildren();this.insertTarget=target;
      const query=el(this.doc,'input');query.placeholder='输入编号，例如 6.30';query.setAttribute('aria-label','查找引用编号');
      const type=el(this.doc,'select');type.append(el(this.doc,'option','全部'));C.TYPES.forEach(t=>type.append(el(this.doc,'option',t)));
      const list=el(this.doc,'div');
      const refresh=()=>{
        list.replaceChildren();let candidates=this.state.sources;
        try{if(query.value.trim())candidates=new C.ReferenceIndex(candidates).find(this.host.scope(this.reader),query.value,type.value==='全部'?undefined:type.value);else if(type.value!=='全部')candidates=candidates.filter(s=>s.type===type.value);}catch(e){list.append(el(this.doc,'p',e.message));return;}
        if(!candidates.length)list.append(el(this.doc,'p','没有匹配来源。先在前文框选区域，再右键标记编号。'));
        for(const s of candidates){
          const row=el(this.doc,'article',undefined,'zma-source-row');row.append(el(this.doc,'strong',`${s.type} (${s.number}) · 第 ${s.pageLabel} 页`),el(this.doc,'p',s.description||''));
          row.append(button(this.doc,'查看原文',()=>this.preview(s)));
          if(target)row.append(button(this.doc,'插入到此批注',async()=>{await this.host.insertReference(this.reader,target,s,this.state);this.status.textContent='引用已插入，点击链接即可在此处查看。';}));
          row.append(button(this.doc,'编辑编号/说明',()=>this.markSource(s)),button(this.doc,'重新关联',()=>{this.relinkID=s.id;this.status.textContent='请在正确位置框选新的区域，再右键“标记为引用来源”。';}),button(this.doc,'删除索引',async()=>{new C.ReferenceIndex(this.state.sources).remove(s.id);await this.persist();refresh();}));
          const preview=el(this.doc,s.kind==='text'?'blockquote':'img');if(s.kind!=='text')preview.alt='来源缩略图';row.prepend(preview);
          this.host.capture(this.reader,s).then(m=>{if(row.isConnected){if(s.kind==='text')this.host.addon.bridge.renderMathPreview(preview,m.text);else preview.src=m.dataURL;}}).catch(()=>{preview.remove();row.prepend(el(this.doc,'p','来源已失效，需要重新定位','zma-invalid'));});
          list.append(row);
        }
      };
      query.addEventListener('input',refresh);type.addEventListener('change',refresh);this.directory.append(query,type,list);refresh();query.focus();
    }
    async preview(source){await this.host.previewReference(this.reader,source,this.insertTarget);}
    async destroy(){this.destroyed=true;this.disposeComposerResize?.();await this.importTask?.catch(()=>{});this.transfer?.destroy();clearTimeout(this.webRenderTimer);this.quotes.destroy();this.liveRenderer?.finish();this.close();clearTimeout(this.draftTimer);this.controller?.abort();this.disposeMath?.();this.disposeClipboard?.();await this.host.save(this.reader,this.state).catch(()=>{});this.node.remove();}
  }
  root.ZMAPanel={Panel,el,button};if(typeof module!=='undefined')module.exports=root.ZMAPanel;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
