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
    return { libraryID:s.libraryID,attachmentKey:s.attachmentKey,annotationKey:s.annotationKey,pageIndex:s.pageIndex,pageLabel:String(s.pageLabel||s.pageIndex+1),rects:s.rects.map(r=>r.slice()),fingerprint:String(s.fingerprint||''),...(s.fullPage?{fullPage:true}:{}) };
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
  function emptyState() {return {version:1,sources:[],references:[],history:[],draft:''};}
  function cleanState(value) {
    if(!value||value.version!==1||!Array.isArray(value.sources)||!Array.isArray(value.references)||!Array.isArray(value.history)||typeof value.draft!=='string')throw new Error('数据损坏或版本不兼容');
    const idx=new ReferenceIndex([]);value.sources.forEach(s=>idx.add(s));
    return {version:1,sources:idx.records,references:value.references.map(r=>({annotationKey:String(r.annotationKey),sourceID:String(r.sourceID),link:String(r.link)})).filter(r=>keyPattern.test(r.annotationKey)&&parseSourceLink(r.link)),history:value.history.map(m=>{
      if(!['user','assistant'].includes(m.role)||typeof m.content!=='string')throw new Error('对话数据损坏');
      return {role:m.role,content:m.content,incomplete:!!m.incomplete,materials:(m.materials||[]).map(s=>({...pickSource(s),type:s.type,number:s.number,description:s.description}))};
    }),draft:value.draft};
  }
  class LocalStore {
    constructor(adapter){this.adapter=adapter;this.queues=new Map();this.blocked=new Set();}
    async load(scope){
      const path=scopeKey(scope)+'.json';
      if(!await this.adapter.exists(path))return emptyState();
      try{return cleanState(JSON.parse(await this.adapter.read(path)));}
      catch{this.blocked.add(path);throw new Error('本地数据损坏：已保留原文件，请先恢复备份，未覆盖数据');}
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
  const api={TYPES,scopeKey,normalizeNumber,validateSource,pickSource,ReferenceIndex,sourceLink,parseSourceLink,storedLink,escapeHTML,emptyState,cleanState,LocalStore};
  root.ZMACore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
