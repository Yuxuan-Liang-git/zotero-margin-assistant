(function(root) {
  'use strict';
  const TYPES = ['公式','段落','图','表'];
  const keyPattern = /^[A-Z0-9]{8}$/;
  function scopeKey(s) {
    if (!Number.isSafeInteger(s.libraryID) || s.libraryID < 1 || !keyPattern.test(s.attachmentKey)) throw new Error('附件标识无效');
    return `${s.libraryID}-${s.attachmentKey}`;
  }
  function normalizeNumber(value) {
    const text=String(value).normalize('NFKC').replace(/\s+/g,'').replace(/^(公式|段落|图|表)/,'').replace(/^\((.*)\)$/,'$1');
    if (!text || text.length>64 || !/^[\p{L}\p{N}._-]+$/u.test(text)) throw new Error('请输入有效编号，例如 6.30');
    return text;
  }
  function validateSource(s) {
    scopeKey(s);
    if (!keyPattern.test(s.annotationKey) || !Number.isSafeInteger(s.pageIndex) || s.pageIndex<0 || !Array.isArray(s.rects) || !s.rects.length || s.rects.some(r=>!Array.isArray(r)||r.length!==4||!r.every(Number.isFinite)||r[0]===r[2]||r[1]===r[3])) throw new Error('来源区域无效');
    return s;
  }
  function pickSource(s) {
    validateSource(s);
    if(s.kind==='text'&&(typeof s.text!=='string'||!s.text.trim()))throw new Error('来源文字为空');
    return { libraryID:s.libraryID,attachmentKey:s.attachmentKey,annotationKey:s.annotationKey,pageIndex:s.pageIndex,pageLabel:String(s.pageLabel||s.pageIndex+1),rects:s.rects.map(r=>r.slice()),fingerprint:String(s.fingerprint||''),...(s.fullPage?{fullPage:true,...(s.automaticPage?{automaticPage:true}:{})}:{}),...(s.kind==='text'?{kind:'text',text:s.text,nextPageRects:s.nextPageRects?.map(r=>r.slice())}:{} ) };
  }
  class ReferenceIndex {
    constructor(records) { this.records=records; }
    add(s) {
      validateSource(s);if(!TYPES.includes(s.type)) throw new Error('引用类型无效');
      const number=normalizeNumber(s.number);
      const id=typeof s.id==='string'&&s.id.length<256?s.id:`${scopeKey(s)}:${s.annotationKey}:${s.type}:${number}`;
      const entry={...pickSource(s),id,type:s.type,number,description:String(s.description||'').slice(0,2000)};
      const at=this.records.findIndex(r=>r.id===id);
      if(at<0)this.records.push(entry);else this.records[at]=entry;
      return entry;
    }
    find(scope,value,type) {
      const number=normalizeNumber(value);
      type=type||TYPES.find(t=>String(value).trim().startsWith(t));
      return this.records.filter(s=>scopeKey(s)===scopeKey(scope)&&s.number===number&&(!type||s.type===type));
    }
    remove(id) { const at=this.records.findIndex(s=>s.id===id);if(at>=0)this.records.splice(at,1); }
  }
  function sourceLink(s,groupID) {
    validateSource(s);
    if(groupID!==undefined&&(!Number.isSafeInteger(groupID)||groupID<1))throw new Error('群组标识无效');
    return `zotero://open-pdf/${groupID?`groups/${groupID}`:'library'}/items/${s.attachmentKey}?page=${s.pageIndex+1}${s.fullPage?'':`&annotation=${s.annotationKey}`}`;
  }
  function parseSourceLink(value) {
    const m=/^zotero:\/\/open-pdf\/(library|groups\/([1-9]\d*))\/items\/([A-Z0-9]{8})\?page=([1-9]\d*)(?:&annotation=([A-Z0-9]{8}))?$/.exec(value||'');
    if(!m||!Number.isSafeInteger(Number(m[4]))||Number(m[4])>1000000)return null;
    return {groupID:m[2]?Number(m[2]):undefined,attachmentKey:m[3],pageIndex:Number(m[4])-1,annotationKey:m[5],...(!m[5]?{fullPage:true}:{})};
  }
  function escapeHTML(v) {return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function storedLink(s,groupID) {return `<a href="${sourceLink(s,groupID)}">${escapeHTML(`${s.type||'来源'} (${s.number||s.annotationKey}) · 第 ${s.pageLabel} 页`)}</a>`;}
  const conversationID=/^[a-zA-Z0-9_-]{1,64}$/;
  function blankConversation(id='default',now=Date.now()){return {id,title:'新对话',createdAt:now,updatedAt:now,history:[],draft:'',summary:'',compactedThrough:0};}
  function emptyState() {const conversation=blankConversation();return {version:2,sources:[],references:[],conversations:[conversation],activeConversationId:conversation.id,images:[],imageNoteKey:null};}
  function activeConversation(state,id=state.activeConversationId){const conversation=state.conversations?.find(c=>c.id===id);if(!conversation)throw new Error('对话不存在');return conversation;}
  function selectConversation(state,id){activeConversation(state,id);state.activeConversationId=id;return activeConversation(state);}
  function createConversation(state,id=`chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`,now=Date.now()){
    if(!conversationID.test(id)||!Number.isSafeInteger(now)||now<0)throw new Error('对话标识无效');
    if(state.conversations.some(c=>c.id===id))throw new Error('对话标识重复');
    const conversation=blankConversation(id,now);state.conversations.push(conversation);state.activeConversationId=id;return conversation;
  }
  function touchConversation(conversation,now=Date.now()){
    if(!Number.isSafeInteger(now)||now<0)throw new Error('对话时间无效');
    conversation.updatedAt=now;
    if(conversation.title==='新对话'){
      const first=conversation.history.find(m=>m.role==='user'&&m.content.trim());
      if(first)conversation.title=Array.from(first.content.trim().replace(/\s+/g,' ')).slice(0,40).join('');
    }
  }
  function pickImage(record){
    const mimeExtensions={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'};
    if(!record||typeof record.id!=='string'||!/^[a-f0-9]{32}$/.test(record.id)||!keyPattern.test(record.annotationKey)||!keyPattern.test(record.noteKey)||!keyPattern.test(record.noteImageKey)||record.fileName!==`margin-comment-${record.id}.${mimeExtensions[record.mime]}`||!mimeExtensions[record.mime])throw new Error('图片记录数据损坏');
    return {id:record.id,annotationKey:record.annotationKey,fileName:record.fileName,mime:record.mime,noteKey:record.noteKey,noteImageKey:record.noteImageKey};
  }
  function pickAttachment(record){
    const extensions={'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
    if(!record||!/^[a-f0-9]{32}$/.test(record.id)||!extensions[record.mime]||record.fileName!==`chat-${record.id}.${extensions[record.mime]}`||typeof record.name!=='string'||!record.name.trim()||record.name.length>240||/[\\/\x00-\x1f]/.test(record.name)||!Number.isSafeInteger(record.size)||record.size<1||record.size>6*1024*1024)throw new Error('附件记录无效');
    return {id:record.id,name:record.name,mime:record.mime,fileName:record.fileName,size:record.size};
  }
  function cleanMessage(m){
    if(!['user','assistant'].includes(m?.role)||typeof m.content!=='string'||m.materials!==undefined&&!Array.isArray(m.materials))throw new Error('对话数据损坏');
    return {role:m.role,content:m.content,incomplete:!!m.incomplete,...(m.attachments?.length?{attachments:m.attachments.map(pickAttachment)}:{}),materials:(m.materials||[]).map(s=>({...pickSource(s),type:s.type,number:s.number,description:s.description})),...(['deepseek','chatgpt'].includes(m.provider)?{provider:m.provider,...(typeof m.model==='string'&&/^[a-z0-9._-]{1,128}$/i.test(m.model)?{model:m.model}:{})}:{})};
  }
  function cleanConversation(c){
    if(!c||!conversationID.test(c.id)||typeof c.title!=='string'||c.title.length>120||!Number.isSafeInteger(c.createdAt)||c.createdAt<0||!Number.isSafeInteger(c.updatedAt)||c.updatedAt<0||!Array.isArray(c.history)||typeof c.draft!=='string')throw new Error('对话数据损坏');
    const summary=c.summary??'',compactedThrough=c.compactedThrough??0;
    if(typeof summary!=='string'||summary.length>20000||!Number.isSafeInteger(compactedThrough)||compactedThrough<0||compactedThrough>c.history.length||compactedThrough%2||compactedThrough>0&&!summary.trim())throw new Error('对话摘要索引损坏');
    return {id:c.id,title:c.title,createdAt:c.createdAt,updatedAt:c.updatedAt,history:c.history.map(cleanMessage),draft:c.draft,...(c.draftAttachments?.length?{draftAttachments:c.draftAttachments.map(pickAttachment)}:{}),summary,compactedThrough};
  }
  function compactionTarget(conversation){
    const history=conversation.history,from=conversation.compactedThrough||0,pending=history.slice(from);
    const size=pending.reduce((n,m)=>n+m.content.length+(m.materials||[]).reduce((total,s)=>total+(s.text?.length||0),0),0);
    if(size<=30000)return from;
    const starts=[];for(let i=from;i<history.length;i++)if(history[i].role==='user')starts.push(i);
    if(starts.length<=1)return size>40000&&history.at(-1)?.role==='assistant'&&!history.at(-1).incomplete?history.length:from;
    let keep=Math.max(0,starts.length-4);
    while(keep<starts.length-1&&history.slice(starts[keep]).reduce((n,m)=>n+m.content.length,0)>14000)keep++;
    const target=Math.max(from,starts[keep]);
    return history.slice(target).reduce((n,m)=>n+m.content.length,0)>40000&&history.at(-1)?.role==='assistant'&&!history.at(-1).incomplete?history.length:target;
  }
  function cleanState(value) {
    if(!value||![1,2].includes(value.version)||!Array.isArray(value.sources)||!Array.isArray(value.references))throw new Error('数据损坏或版本不兼容');
    const idx=new ReferenceIndex([]);value.sources.forEach(s=>idx.add(s));
    if(value.images!==undefined&&!Array.isArray(value.images)||value.imageNoteKey&&(!keyPattern.test(value.imageNoteKey)||typeof value.imageNoteKey!=='string'))throw new Error('图片记录数据损坏');
    let conversations,activeConversationId;
    if(value.version===1){
      if(!Array.isArray(value.history)||typeof value.draft!=='string')throw new Error('旧版对话数据损坏');
      const legacy=blankConversation('default',0);legacy.history=value.history.map(cleanMessage);legacy.draft=value.draft;touchConversation(legacy,0);
      conversations=[legacy];activeConversationId=legacy.id;
    }else{
      if(!Array.isArray(value.conversations)||!value.conversations.length||typeof value.activeConversationId!=='string')throw new Error('对话数据损坏');
      conversations=value.conversations.map(cleanConversation);activeConversationId=value.activeConversationId;
      if(new Set(conversations.map(c=>c.id)).size!==conversations.length||!conversations.some(c=>c.id===activeConversationId))throw new Error('对话索引损坏');
    }
    return {version:2,sources:idx.records,references:value.references.map(r=>({annotationKey:String(r.annotationKey),sourceID:String(r.sourceID),link:String(r.link)})).filter(r=>keyPattern.test(r.annotationKey)&&parseSourceLink(r.link)),conversations,activeConversationId,images:(value.images||[]).map(pickImage),imageNoteKey:value.imageNoteKey||null};
  }
  class LocalStore {
    constructor(adapter){this.adapter=adapter;this.queues=new Map();this.blocked=new Set();}
    async load(scope){
      const path=scopeKey(scope)+'.json';
      if(!await this.adapter.exists(path))return emptyState();
      let raw,parsed,state;
      try{raw=await this.adapter.read(path);parsed=JSON.parse(raw);state=cleanState(parsed);}
      catch{this.blocked.add(path);throw new Error('本地数据损坏：已保留原文件，请先恢复备份，未覆盖数据');}
      if(parsed.version===1){
        try{if(!await this.adapter.exists(path+'.v1.bak'))await this.adapter.writeAtomic(path+'.v1.bak',raw);}
        catch{this.blocked.add(path);throw new Error('旧版对话备份失败：未覆盖原文件');}
      }
      return state;
    }
    save(scope,state){
      const path=scopeKey(scope)+'.json';
      if(this.blocked.has(path))return Promise.reject(new Error('本地数据损坏，禁止覆盖'));
      const snapshot=JSON.stringify(cleanState(state));
      const write=(this.queues.get(path)||Promise.resolve()).catch(()=>{}).then(()=>this.adapter.writeAtomic(path,snapshot));
      this.queues.set(path,write);return write;
    }
    async flush(){await Promise.all(this.queues.values());}
  }
  const api={TYPES,scopeKey,pickAttachment,normalizeNumber,validateSource,pickSource,ReferenceIndex,sourceLink,parseSourceLink,storedLink,escapeHTML,emptyState,activeConversation,selectConversation,createConversation,touchConversation,compactionTarget,cleanState,LocalStore};
  root.ZMACore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
