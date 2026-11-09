(function(root){
  'use strict';
  const T=root.ZMATransfer;
  function el(d,tag,text){const n=d.createElementNS('http://www.w3.org/1999/xhtml',tag);if(text!==undefined)n.textContent=text;return n;}
  class TransferUI{
    constructor(panel){this.panel=panel;this.revision=0;this.saving=false;}
    idle(){const p=this.panel;if(p.busy||p.pendingMaterials.size||p.host.isGenerating?.(p.reader))throw new Error('请先等待当前操作完成');if(p.destroyed)throw new Error('文档助手已关闭');}
    close(){if(this.saving)return;this.revision++;this.dialog?.remove();this.dialog=null;this.candidates=null;this.prepared=null;}
    action(label,run){const b=el(this.panel.doc,'button',label);b.type='button';b.addEventListener('click',()=>{b.disabled=true;Promise.resolve().then(()=>{this.idle();return run();}).catch(e=>{if(this.dialog)this.note.textContent=e.message||String(e);else this.panel.error(e);}).finally(()=>{b.disabled=false;});});return b;}
    open(){
      this.idle();this.close();const p=this.panel,d=p.doc;p.showConversations();this.dialog=el(d,'section');this.dialog.className='zma-transfer-dialog';this.dialog.setAttribute('role','dialog');this.dialog.setAttribute('aria-label','导入对话');
      this.note=el(d,'p');this.note.setAttribute('role','status');this.body=el(d,'div');this.dialog.append(el(d,'h3','导入对话'),el(d,'p',`导入到：${p.host.conversationTarget?.(p.reader)||'当前 PDF'}。保存为独立的新对话，现有记录保留。`),this.body,this.note,this.action('取消',()=>this.close()));p.node.append(this.dialog);this.entry();
    }
    entry(){
      const d=this.panel.doc;this.body.replaceChildren();this.prepared=null;this.note.textContent='支持解压后的 ChatGPT conversations.json 和插件导出的 JSON（最多 16 MiB）。只导入文字，原上传附件需另行添加。';
      const input=el(d,'textarea');input.setAttribute('aria-label','粘贴对话文本');input.setAttribute('contenteditable','true');input.maxLength=T.MAX_TEXT;input.placeholder='用户：\n解释公式 (6.30)\n助手：\n这里是此前的回答…';
      this.body.append(this.action('选择 JSON 文件',async()=>{const revision=this.revision,raw=await this.panel.host.readConversationFile();if(raw===null||revision!==this.revision||this.panel.destroyed)return;this.idle();const list=T.parseJSON(raw);this.candidates=list;this.select(list);}),el(d,'h4','或粘贴对话'),input,this.action('预览粘贴内容',()=>this.preview(T.parseText(input.value))));input.focus();
    }
    select(list){
      const d=this.panel.doc;this.body.replaceChildren();const search=el(d,'input');search.type='search';search.placeholder='按标题筛选';search.setAttribute('aria-label','筛选导入对话');const choices=el(d,'select');choices.size=6;choices.setAttribute('aria-label','选择导入对话');
      const refresh=()=>{choices.replaceChildren();let count=0;for(const [i,c]of list.entries()){if(!c.title.toLowerCase().includes(search.value.toLowerCase()))continue;const o=el(d,'option',c.title);o.value=String(i);choices.append(o);if(++count===200)break;}if(choices.options.length)choices.selectedIndex=0;};search.addEventListener('input',refresh);refresh();
      this.body.append(el(d,'p',`找到 ${list.length} 段对话/分支；每次显示前 200 个匹配标题，请筛选并选择一段。`),search,choices,this.action('预览所选对话',()=>{if(choices.selectedIndex<0)throw new Error('请先选择一段对话');this.preview(T.prepare(list[Number(choices.value)]));}),this.action('返回',()=>this.entry()));this.note.textContent='有分支时按所选路径导入，不合并其他分支。';
    }
    preview(prepared){
      const d=this.panel.doc;this.prepared=prepared;this.body.replaceChildren();const name=el(d,'input');name.value=prepared.title;name.maxLength=120;name.setAttribute('aria-label','导入对话标题');this.body.append(el(d,'p',`预览：${prepared.history.length} 条消息${prepared.draft?'，另有未发送草稿':''}。仅预览部分文字，导入保留限额内的完整正文。`),name);
      for(const w of prepared.warnings){const n=el(d,'p',w);n.className='zma-invalid';this.body.append(n);}
      const messages=prepared.history.length>6?[...prepared.history.slice(0,4),...prepared.history.slice(-2)]:prepared.history;
      messages.forEach((m,i)=>{if(prepared.history.length>6&&i===4)this.body.append(el(d,'p','…… 中间消息已折叠 ……'));const card=el(d,'article');card.append(el(d,'strong',m.role==='user'?'用户':'助手'),el(d,'pre',m.content.slice(0,2000)+(m.content.length>2000?'\n……预览已截短':'')));this.body.append(card);});
      if(prepared.draft)this.body.append(el(d,'strong','未发送草稿'),el(d,'pre',prepared.draft.slice(0,2000)));
      this.body.append(this.action('确认导入为新对话',async()=>{if(this.saving)return;if(!name.value.trim())throw new Error('请输入对话标题');this.saving=true;try{await this.panel.commitImport({...prepared,title:name.value});}finally{this.saving=false;}this.close();}),this.action('返回',()=>this.entry()));this.note.textContent='确认前不会写入历史文件，也不会调用 AI。';
    }
    async exportConversation(id,format){
      this.idle();const p=this.panel,c=p.state.conversations.find(c=>c.id===id);if(!c)throw new Error('对话不存在');if(!['json','md'].includes(format))throw new Error('导出格式无效');
      const text=format==='json'?T.exportJSON(c):T.exportMarkdown(c),saved=await p.host.writeConversationFile(text,format,c.title);if(saved&&!p.destroyed)p.status.textContent='对话已导出；附件和 PDF 文件需另外保存。';
    }
    destroy(){this.saving=false;this.close();}
  }
  root.ZMATransferUI={TransferUI};if(typeof module!=='undefined')module.exports=root.ZMATransferUI;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
