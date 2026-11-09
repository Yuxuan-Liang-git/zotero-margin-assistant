(function(root){
  'use strict';
  const C=root.ZMACore,D=root.ZMADeepSeek;
  function el(doc,tag,text,className){const node=doc.createElementNS('http://www.w3.org/1999/xhtml',tag);if(text!==undefined)node.textContent=text;if(className)node.setAttribute('class',className);return node;}
  function button(doc,label,action){const b=el(doc,'button',label);b.type='button';b.addEventListener('click',()=>Promise.resolve().then(action).catch(e=>doc.defaultView?.alert?.(e.message)));return b;}
  class Panel{
    /** @type {(()=>void)|undefined} */
    disposeMath;
    constructor(host,reader,doc){this.host=host;this.reader=reader;this.doc=doc;this.materials=[];this.pendingMaterials=new Set();this.destroyed=false;this.busy=false;this.relinkID=null;}
    async init(){
      this.state=await this.host.load(this.reader);this.conversationId=this.state.activeConversationId;const d=this.doc;
      this.node=el(d,'aside',undefined,'zma-panel');this.node.setAttribute('aria-label','区域阅读助手');this.node.hidden=true;
      const header=el(d,'header');header.append(el(d,'strong','DeepSeek · 文档助手'),button(d,'设置',()=>this.host.settings()),button(d,'关闭',()=>this.close()));
      this.tabs=el(d,'nav');this.chat=el(d,'section');this.directory=el(d,'section');this.directory.hidden=true;this.conversationList=el(d,'section',undefined,'zma-conversations');this.conversationList.hidden=true;
      this.tabs.append(button(d,'提问',()=>this.showChat()),button(d,'对话记录',()=>this.showConversations()),button(d,'引用目录',()=>this.showDirectory()));
      const info=el(d,'p','自动读取当前 PDF，发送时提供文档背景；可附加框选材料。','zma-info');
      this.activeLabel=el(d,'strong',undefined,'zma-active-conversation');
      this.materialList=el(d,'div',undefined,'zma-materials');
      this.messages=el(d,'div',undefined,'zma-messages');
      this.question=el(d,'textarea');this.question.dataset.zma='question';this.question.placeholder='例如：公式 (7.41) 如何由 (6.30) 推出？';this.question.setAttribute('aria-label','问题');this.question.value=this.conversation().draft;
      this.question.addEventListener('input',()=>{const conversation=this.conversation();conversation.draft=this.question.value;C.touchConversation(conversation);clearTimeout(this.draftTimer);this.draftTimer=setTimeout(()=>this.persist().catch(e=>this.error(e)),500);});
      this.question.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey||e.isComposing||e.keyCode===229)return;e.preventDefault();if(!this.busy)void this.send().catch(error=>this.error(error));});
      this.sendButton=button(d,'发送',()=>this.send());this.sendButton.dataset.zma='send';
      this.stopButton=button(d,'停止生成',()=>this.controller?.abort());this.stopButton.disabled=true;
      const actions=el(d,'div',undefined,'zma-actions');actions.append(this.sendButton,this.stopButton,button(d,'添加当前页',()=>this.addMaterial(()=>this.host.currentPage(this.reader))),button(d,'新会话',()=>this.newConversation()));
      this.contextInfo=el(d,'p','文档背景：自动使用当前 PDF。','zma-context-info');
      this.status=el(d,'p','Enter 发送，Shift+Enter 换行。','zma-status');this.status.setAttribute('role','status');
      const composer=el(d,'div',undefined,'zma-composer');composer.append(this.question,actions);this.chat.className='zma-chat';this.chat.append(this.activeLabel,info,this.contextInfo,this.materialList,this.messages,composer);
      this.previewArea=el(d,'section',undefined,'zma-previews');
      this.node.append(header,this.tabs,this.previewArea,this.chat,this.conversationList,this.directory,this.status);d.body.append(this.node);
      this.directory.className='zma-directory';this.installResizeHandle();
      this.renderMaterials();this.renderMessages();this.renderConversationList();return this;
    }
    installResizeHandle(){
      const handle=el(this.doc,'div',undefined,'zma-resizer');handle.setAttribute('role','separator');handle.setAttribute('aria-label','调整文档助手宽度');handle.setAttribute('aria-orientation','vertical');this.node.prepend(handle);
      let dragging=false;const resize=e=>{if(!dragging)return;const viewport=this.doc.defaultView.innerWidth,width=Math.max(280,Math.min(viewport*.55,viewport-e.clientX));this.doc.documentElement.style.setProperty('--zma-assistant-user-width',`${width}px`);};
      handle.addEventListener('pointerdown',e=>{dragging=true;handle.setPointerCapture?.(e.pointerId);e.preventDefault();});handle.addEventListener('pointermove',resize);handle.addEventListener('pointerup',e=>{resize(e);dragging=false;handle.releasePointerCapture?.(e.pointerId);});handle.addEventListener('pointercancel',()=>{dragging=false;});
    }
    open(){this.node.hidden=false;this.doc.body.classList.add('zma-assistant-open');}
    close(){this.node.hidden=true;this.doc.body.classList.remove('zma-assistant-open');}
    conversation(){return C.activeConversation(this.state,this.conversationId);}
    showChat(){this.open();this.chat.hidden=false;this.directory.hidden=true;this.conversationList.hidden=true;}
    showConversations(){this.open();this.chat.hidden=true;this.directory.hidden=true;this.conversationList.hidden=false;this.renderConversationList();}
    renderConversationList(){
      this.conversationList.replaceChildren(button(this.doc,'新会话',()=>this.newConversation()));
      for(const conversation of [...this.state.conversations].sort((a,b)=>b.updatedAt-a.updatedAt)){
        const row=el(this.doc,'div',undefined,'zma-conversation-row');
        if(conversation.id===this.conversationId)row.classList.add('zma-current');
        const label=conversation.title||'新对话';
        const open=button(this.doc,label,()=>this.switchConversation(conversation.id));open.title=label;
        row.append(open,el(this.doc,'small',conversation.updatedAt?new Date(conversation.updatedAt).toLocaleString():'旧版对话'));
        this.conversationList.append(row);
      }
    }
    async switchConversation(id){
      if(this.busy||this.pendingMaterials.size||this.host.isGenerating?.(this.reader))throw new Error('请先等待当前操作完成');
      C.selectConversation(this.state,id);this.conversationId=id;this.materials=[];this.question.value=this.conversation().draft;
      this.contextInfo.textContent='文档背景：自动使用当前 PDF。';this.renderMaterials();this.renderMessages();this.renderConversationList();this.showChat();await this.persist();
    }
    async newConversation(){
      if(this.busy||this.pendingMaterials.size||this.host.isGenerating?.(this.reader))throw new Error('请先等待当前操作完成');
      const current=this.conversation();
      const next=current.history.length||current.draft.trim()?C.createConversation(this.state):current;
      await this.switchConversation(next.id);this.question.focus();
    }
    error(e){if(!this.destroyed)this.status.textContent=e.message||String(e);}
    async persist(){if(this.destroyed)return;await this.host.save(this.reader,this.state);}
    async addMaterial(source){
      this.showChat();this.status.textContent='正在读取所选材料…';
      if(this.busy||this.host.isGenerating?.(this.reader))throw new Error('生成期间不能更改材料');
      const loader=typeof source==='function';let key=loader?Symbol('source-lookup'):`${source.annotationKey}:${source.pageIndex}`;
      if(!loader&&(this.pendingMaterials.has(key)||this.materials.some(m=>m.source.annotationKey===source.annotationKey&&m.source.pageIndex===source.pageIndex)))return;
      if(this.materials.length+this.pendingMaterials.size>=8)throw new Error('每次最多 8 个区域');
      this.pendingMaterials.add(key);this.sendButton.disabled=true;
      try{
        if(loader){source=await source();if(this.destroyed)return;const resolvedKey=`${source.annotationKey}:${source.pageIndex}`;this.pendingMaterials.delete(key);if(this.pendingMaterials.has(resolvedKey)||this.materials.some(m=>m.source.annotationKey===source.annotationKey&&m.source.pageIndex===source.pageIndex))return;key=resolvedKey;this.pendingMaterials.add(key);}
        if(this.busy||this.host.isGenerating?.(this.reader))throw new Error('生成期间不能更改材料');
        const material=await this.host.capture(this.reader,source);if(this.destroyed)return;
        if(this.busy||this.host.isGenerating?.(this.reader))throw new Error('生成期间不能更改材料');
        this.materials.push(material);this.showChat();this.renderMaterials();this.status.textContent='材料已加入，可输入问题或继续添加前文。';
      }finally{this.pendingMaterials.delete(key);if(!this.destroyed)this.sendButton.disabled=this.busy||this.pendingMaterials.size>0;}
    }
    renderMaterials(){
      this.materialList.replaceChildren();
      for(const [i,m]of this.materials.entries()){
        const card=el(this.doc,'div',undefined,'zma-material');const label=`${m.source.type||'区域'} ${m.source.number||''} 第 ${m.source.pageLabel} 页`;
        const remove=button(this.doc,'移除',()=>{if(this.busy)throw new Error('请先停止生成');this.materials.splice(i,1);this.renderMaterials();});remove.disabled=this.busy;
        if(m.source.kind==='text')card.append(el(this.doc,'blockquote',m.text,'zma-material-text'));else{const img=el(this.doc,'img');img.src=m.dataURL;img.alt=label;card.append(img);}card.append(el(this.doc,'small',label),remove);this.materialList.append(card);
      }
    }
    renderMessages(){
      this.messages.replaceChildren();
      const conversation=this.conversation();this.activeLabel.textContent=`当前对话：${conversation.title||'新对话'}`;
      conversation.history.forEach((m,i)=>{
        const card=el(this.doc,'article',undefined,`zma-message zma-${m.role}`);card.append(el(this.doc,'strong',m.role==='user'?'问题':m.incomplete?'回答（未完成）':'回答'));
        const text=el(this.doc,'div',undefined,'zma-answer');
        if(m.role==='assistant')this.renderAnswer(text,m.content);else text.textContent=m.content;
        card.append(text);
        if(m.role==='assistant'&&m.content){const actions=el(this.doc,'div',undefined,'zma-actions');actions.append(button(this.doc,'复制',()=>this.host.copy(m.content)),button(this.doc,'保存为笔记',()=>this.saveAnswer(i,'note')),button(this.doc,'保存到批注',()=>this.saveAnswer(i,'comment')));card.append(actions);}
        this.messages.append(card);
      });
      if(!conversation.history.length)this.messages.append(el(this.doc,'p','直接问“当前这篇论文讲了什么”即可；助手会自动读取当前 PDF。也可框选内容或加入前文引用，进一步解释公式。','zma-empty-chat'));
      this.messages.scrollTop=this.messages.scrollHeight;
    }
    renderAnswer(node,text){if(root.ZMAMarkdown)root.ZMAMarkdown.render(node,text,this.host.addon.bridge.renderMathPreview);else this.host.addon.bridge.renderMathPreview(node,text);}
    async send(){
      if(this.busy)return;if(this.pendingMaterials.size)throw new Error('材料正在读取，请完成后再发送');const question=this.question.value.trim();if(!question)throw new Error('请输入问题');
      // A retry replaces the failed pair, rather than duplicating its user message.
      const conversation=this.conversation(),history=conversation.history.slice();
      if(history.at(-1)?.incomplete&&history.at(-2)?.role==='user'&&history.at(-2).content===question)history.splice(-2);
      const controller=this.host.newAbortController();this.host.claimRequest?.(this.reader);this.busy=true;this.sendButton.disabled=true;this.stopButton.disabled=false;this.renderMaterials();this.status.textContent='准备来源…';
      this.controller=controller;const deadline=setTimeout(()=>this.controller?.abort(),180000);
      let user,answer;
      try{
        const hydrated=[];
        for(const m of history){
          if(m.role==='assistant'){hydrated.push(m);continue;}
          const materials=[];for(const s of m.materials||[])materials.push(await this.host.capture(this.reader,s));
          hydrated.push({...m,materials});
        }
        const refreshed=[];for(const material of this.materials)refreshed.push(await this.host.capture(this.reader,material.source));
        const baseMessages=D.buildMessages(hydrated,question,refreshed);
        const context=await this.host.documentContext?.(this.reader,question,{budget:58000-D.textSize(baseMessages),signal:this.controller.signal,onProgress:(n,total)=>{if(!this.destroyed)this.status.textContent=`正在读取当前 PDF：${n}/${total} 页…`;}});
        if(context&&!this.destroyed)this.contextInfo.textContent=(context.mode==='full-text'?`本轮使用：${context.title} · 全文 ${context.totalPages} 页`:`本轮使用：${context.title} · ${context.mode==='current-page-image'?'当前页截图':'相关文字节选'}（PDF 第 ${context.pages.join('、')} 页）`)+(context.material&&context.mode!=='current-page-image'?`；当前页截图（PDF 第 ${context.material.source.pageIndex+1} 页）`:'');
        const messages=D.buildMessages(hydrated,question,refreshed,context);
        if(this.controller.signal.aborted)throw new Error('生成已停止');
        const submitted=[...refreshed];if(context?.material&&submitted.length<8&&!submitted.some(m=>m.source.fullPage&&m.source.pageIndex===context.material.source.pageIndex))submitted.push(context.material);
        user={role:'user',content:question,materials:submitted.map(m=>({...C.pickSource(m.source),type:m.source.type,number:m.source.number,description:m.source.description})),incomplete:false};
        answer={role:'assistant',content:'',materials:[],incomplete:true};
        conversation.history=[...history,user,answer];conversation.draft=this.question.value;C.touchConversation(conversation);await this.persist();this.renderMessages();this.renderConversationList();
        this.status.textContent='DeepSeek 正在回答…';
        answer.content=await this.host.client.generate(messages,{signal:this.controller.signal,onDelta:delta=>{
          answer.content+=delta;if(!this.destroyed){const follow=this.messages.scrollHeight-this.messages.scrollTop-this.messages.clientHeight<80;const last=this.messages.lastElementChild?.querySelector('.zma-answer');if(last)this.renderAnswer(last,answer.content);if(follow)this.messages.scrollTop=this.messages.scrollHeight;}
        }});
        answer.incomplete=false;if(this.question.value.trim()===question)this.question.value='';conversation.draft=this.question.value;C.touchConversation(conversation);this.status.textContent='回答完成，可追问或保存。';
      }catch(e){
        if(answer){answer.content=e.partial??answer.content;answer.incomplete=true;}
        conversation.draft=this.question.value;C.touchConversation(conversation);this.error(e);
      }finally{
        clearTimeout(deadline);this.controller=null;this.busy=false;this.host.releaseRequest?.(this.reader);
        if(!this.destroyed){this.sendButton.disabled=this.pendingMaterials.size>0;this.stopButton.disabled=true;this.renderMaterials();this.renderMessages();this.renderConversationList();await this.persist().catch(e=>this.error(e));}
      }
    }
    async saveAnswer(index,kind){
      if(this.busy)throw new Error('请先等待回答或停止生成');
      const history=this.conversation().history,answer=history[index],question=history[index-1];if(!answer?.content||question?.role!=='user')return;
      const doc=this.doc;const form=el(doc,'div',undefined,'zma-save-preview');
      const preview=el(doc,'textarea');preview.value=`问题：${question.content}\n\n${answer.incomplete?'[未完成回答]\n':''}${answer.content}`;
      preview.setAttribute('aria-label','保存内容预览');
      let target;
      form.append(el(doc,'strong','检查并编辑保存内容'),preview);
      if(kind==='comment'){
        target=el(doc,'select');for(const s of question.materials){if(s.fullPage)continue;const option=el(doc,'option',`第 ${s.pageLabel} 页 · ${s.annotationKey}`);option.value=s.annotationKey;target.append(option);}form.append(target);
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
      this.open();this.chat.hidden=true;this.conversationList.hidden=true;this.directory.hidden=false;this.directory.replaceChildren();this.insertTarget=target;
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
    async destroy(){this.destroyed=true;this.close();clearTimeout(this.draftTimer);this.controller?.abort();this.disposeMath?.();await this.host.save(this.reader,this.state).catch(()=>{});this.node.remove();}
  }
  root.ZMAPanel={Panel,el,button};if(typeof module!=='undefined')module.exports=root.ZMAPanel;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
