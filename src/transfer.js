(function(root){
  'use strict';
  const C=root.ZMACore||(typeof require!=='undefined'?require('./core.js'):null);
  const Memory=root.ZMAMemoryCore||(typeof require!=='undefined'?require('./memory-core.js'):null);
  const MAX_FILE=16*1024*1024,MAX_TEXT=2*1024*1024,MAX_MESSAGE=100000,MAX_TOTAL=1000000,MAX_MESSAGES=200;
  const titleOf=value=>typeof value==='string'&&value.trim()?Array.from(value.trim()).slice(0,120).join(''):'导入对话';
  const mediaWarning='原对话的附件、图片和 PDF 引用材料未随文字导入；如需使用请重新添加。';
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function bounded(raw,max){if(typeof raw!=='string'||!raw.trim())throw new Error('请输入或选择非空对话记录');if(raw.length>max)throw new Error('对话文件或文本超过大小限制，请仅导出需要的对话');}
  function normalize(messages,{title='导入对话',draft='',warnings=[],createdAt=Date.now(),updatedAt=Date.now(),preserveEmptyAnswers=false}={}){
    if(!Array.isArray(messages)||messages.length>20000)throw new Error('对话消息数量超过限制或结构无效');
    const history=[];let total=0;
    for(const m of messages){
      if(!['user','assistant'].includes(m?.role)||typeof m.content!=='string')throw new Error('对话角色或正文无效');
      if(m.content.length>MAX_MESSAGE)throw new Error('单条消息超过 100000 字符，请缩短后导入');
      total+=m.content.length;if(total>MAX_TOTAL)throw new Error('对话正文超过 1000000 字符，请分段导入');
      if(!m.content.trim()&&!(preserveEmptyAnswers&&m.role==='assistant'))continue;
      const last=history.at(-1);
      const memorySources=m.memorySources&&Memory?Memory.cleanSources(m.memorySources):undefined;
      if(last?.role===m.role){last.content=Memory?Memory.annotatedText(last.content,last.memorySources)+'\n\n'+Memory.annotatedText(m.content,memorySources):last.content+'\n\n'+m.content;delete last.memorySources;last.incomplete=!!m.incomplete;if(last.content.length>MAX_MESSAGE)throw new Error('合并后的单条消息超过 100000 字符');}
      else history.push({role:m.role,content:m.content,incomplete:!!m.incomplete,materials:[],...(memorySources?.length?{memorySources}:{})});
    }
    if(typeof draft!=='string'||draft.length>MAX_MESSAGE)throw new Error('草稿无效或超过 100000 字符');
    if(!history.length&&!draft.trim())throw new Error('没有可导入的用户/助手文字消息');
    if(history.length&&history[0].role!=='user')throw new Error('首条消息应为用户提问，请整理角色后导入');
    if(history.length>MAX_MESSAGES)throw new Error('对话超过 200 条消息，请分段导入');
    if(typeof draft!=='string'||draft.length>MAX_MESSAGE)throw new Error('草稿无效或超过 100000 字符');
    const notes=warnings.filter(w=>typeof w==='string').map(w=>w.slice(0,300)).slice(0,16);
    if(history.at(-1)?.role==='user'){const pending=history.pop().content;draft=pending+(draft&&draft!==pending?'\n\n'+draft:'');notes.push('最后一条尚未回答的用户提问已放入输入框草稿。');}
    if(draft.length>MAX_MESSAGE)throw new Error('草稿超过 100000 字符');
    const now=Date.now(),time=x=>Number.isSafeInteger(x)&&x>=0?x:now;
    return {title:titleOf(title),history,draft,createdAt:time(createdAt),updatedAt:time(updatedAt),warnings:[...new Set(notes)]};
  }
  function native(candidate){
    const c=candidate.data;
    if(!c||!Array.isArray(c.history))throw new Error('插件对话格式无效');
    const warnings=[...(Array.isArray(c.warnings)?c.warnings:[])];
    if(c.draftAttachments?.length||c.draftQuotes?.length||c.history.some(m=>m.materials?.length||m.attachments?.length||m.pdfContext))warnings.push(mediaWarning);
    const W=root.ZMAWeb||(typeof require!=='undefined'?require('./web.js'):null);
    return normalize(c.history.map(m=>({role:m.role,content:m.role==='assistant'&&m.web&&W?W.citedText(m.content,m.web):m.content,incomplete:m.incomplete,memorySources:m.memorySources})),{...c,warnings,preserveEmptyAnswers:true});
  }
  function parseJSON(raw){
    bounded(raw,MAX_FILE);let value;try{value=JSON.parse(raw.replace(/^\uFEFF/,''));}catch{throw new Error('JSON 无法解析，请选择解压后的 conversations.json 或插件导出的 JSON');}
    if(value?.format==='zma-conversation'){
      if(value.version!==1)throw new Error('不支持的导出格式版本');
      return [{title:titleOf(value.conversation?.title),kind:'native',data:value.conversation}];
    }
    if(value?.version===2&&Array.isArray(value.conversations))return value.conversations.map(data=>({title:titleOf(data.title),kind:'native',data}));
    if(value?.version===1&&Array.isArray(value.history))return [{title:'旧版对话',kind:'native',data:value}];
    const chats=Array.isArray(value)?value:value?.mapping?[value]:null;if(!chats?.length||chats.length>5000)throw new Error('不识别此 JSON 对话格式或对话数量超过限制');
    const candidates=[];
    for(const chat of chats){
      if(!chat?.mapping||typeof chat.mapping!=='object'||Array.isArray(chat.mapping))throw new Error('ChatGPT 导出缺少 mapping 对话结构');
      const keys=Object.keys(chat.mapping);if(keys.length>100000)throw new Error('对话节点超过限制');
      let leaves;
      if(chat.current_node){if(typeof chat.current_node!=='string'||!own(chat.mapping,chat.current_node))throw new Error('ChatGPT 当前分支标识无效');leaves=[chat.current_node];}
      else{const parents=new Set(keys.map(k=>chat.mapping[k]?.parent).filter(Boolean));leaves=keys.filter(k=>!parents.has(k));if(!leaves.length)throw new Error('ChatGPT 分支无可用终点，可能存在循环');}
      if(candidates.length+leaves.length>5000)throw new Error('可选对话分支超过限制');
      leaves.forEach((leaf,i)=>candidates.push({title:titleOf(chat.title)+(leaves.length>1?` · 分支 ${i+1}`:''),kind:'chatgpt',data:chat,leaf}));
    }
    if(!candidates.length)throw new Error('没有可导入的对话');return candidates;
  }
  function prepare(candidate){
    if(candidate?.kind==='native')return native(candidate);
    if(candidate?.kind!=='chatgpt')throw new Error('未选择有效对话');
    const chat=candidate.data,messages=[],seen=new Set();let key=candidate.leaf,media=false;
    while(key!==null&&key!==undefined){
      if(typeof key!=='string'||!own(chat.mapping,key))throw new Error('对话分支的父节点丢失');
      if(seen.has(key))throw new Error('对话分支存在循环');seen.add(key);if(seen.size>20000)throw new Error('对话分支过长');
      const n=chat.mapping[key],m=n?.message,role=m?.author?.role;
      if(m&&['user','assistant'].includes(role)&&!m.metadata?.is_visually_hidden_from_conversation&&!['analysis','commentary','justify','confidence','summary'].includes(m.channel)&&(!m.recipient||m.recipient==='all')){
        if(m.metadata?.attachments?.length)media=true;
        const parts=m.content?.parts;if(!Array.isArray(parts))throw new Error('选中对话含无法识别的消息内容格式');
        const text=[];
        for(const p of parts){if(typeof p==='string')text.push(p);else if(p?.content_type==='text'&&typeof p.text==='string')text.push(p.text);else media=true;}
        if(!text.join('').trim()&&parts.length)text.push('［原对话包含未导入的非文本内容］');
        messages.push({role,content:text.join('\n'),incomplete:m.status==='in_progress'||m.status==='incomplete'});
      }
      key=n?.parent;
    }
    const time=x=>Number.isFinite(x)&&x>=0?Math.round(x*1000):undefined;
    return normalize(messages.reverse(),{title:candidate.title,createdAt:time(chat.create_time),updatedAt:time(chat.update_time),warnings:media?[mediaWarning]:[]});
  }
  function parseText(raw,title='导入对话'){
    bounded(raw,MAX_TEXT);const messages=[];let current=null,fence=null;
    for(const line of raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n')){
      const code=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if(code){if(!fence)fence={char:code[1][0],size:code[1].length};else if(code[1][0]===fence.char&&code[1].length>=fence.size&&!code[2].trim())fence=null;}
      const role=!fence&&!code?/^\s*(?:#{1,6}\s+)?(用户|助手|你说|You(?: said)?|ChatGPT(?:\s*说| said)?|User|Assistant)\s*[:：]\s*(.*)$/i.exec(line):null;
      if(role){if(current)messages.push(current);current={role:/^(用户|你说|you(?: said)?|user)$/i.test(role[1])?'user':'assistant',content:role[2]};}
      else if(current)current.content+=(current.content?'\n':'')+line;
      else if(line.trim())throw new Error('缺少明确角色，请按“用户：/助手：”分段粘贴对话');
    }
    if(current)messages.push(current);if(!messages.length)throw new Error('未识别角色，请按“用户：/助手：”分段粘贴对话');
    return normalize(messages,{title});
  }
  function portable(c){
    if(!Array.isArray(c?.history)||typeof c.draft!=='string')throw new Error('对话结构无效');
    const W=root.ZMAWeb||(typeof require!=='undefined'?require('./web.js'):null),warnings=[];
    if(c.draftAttachments?.length||c.draftQuotes?.length||c.history.some(m=>m.materials?.length||m.attachments?.length||m.pdfContext))warnings.push(mediaWarning);
    const history=c.history.map(m=>{if(!['user','assistant'].includes(m.role)||typeof m.content!=='string')throw new Error('对话角色或正文无效');return {role:m.role,content:m.role==='assistant'&&m.web&&W?W.citedText(m.content,m.web):m.content,incomplete:!!m.incomplete,...(m.memorySources?.length&&Memory?{memorySources:Memory.cleanSources(m.memorySources)}:{})};});
    return {title:titleOf(c.title),createdAt:c.createdAt,updatedAt:c.updatedAt,history,draft:c.draft,warnings};
  }
  function exportJSON(c){return JSON.stringify({format:'zma-conversation',version:1,conversation:portable(c)},null,2)+'\n';}
  function exportMarkdown(c){const p=portable(c);return `# ${p.title}\n\n`+p.history.map(m=>`## ${m.role==='user'?'用户':'助手'}${m.incomplete?'（未完成）':''}\n\n${Memory?Memory.annotatedText(m.content,m.memorySources):m.content}\n\n`).join('')+(p.draft?`## 未发送草稿\n\n${p.draft}\n\n`:'')+(p.warnings.length?'---\n\n'+p.warnings.join('\n\n')+'\n':'');}
  function importState(state,prepared){
    const p=normalize(prepared.history,{...prepared,preserveEmptyAnswers:true}),copy=C.cleanState(state),c=C.createConversation(copy);
    Object.assign(c,{title:p.title,createdAt:p.createdAt,updatedAt:Date.now(),history:p.history,draft:p.draft});return C.cleanState(copy);
  }
  const api={MAX_FILE,MAX_TEXT,parseJSON,parseText,prepare,exportJSON,exportMarkdown,importState};root.ZMATransfer=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
