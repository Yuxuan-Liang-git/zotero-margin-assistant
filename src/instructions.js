(function(root){
  'use strict';
  const DEFAULT=`在撰写报告、文档、技术解释、分析或任何长篇内容时，应使用清晰、流畅的散文，采用完整的段落和句子。通过标准的段落换行来组织结构，并将 markdown 主要用于 inline code、代码块(...) 以及简单标题（如 ###）。避免使用加粗或斜体格式。

除非满足以下情况，否则不要使用有序列表或无序列表：其一，所表达的内容确实是彼此独立的项目，且列表形式最为合适；其二，用户明确要求使用列表或排名形式。

不要用项目符号或编号来罗列内容，而应将各个要点自然地融入句子之中。这一原则在技术写作中尤为重要。采用连贯的散文表达而非过度格式化，可以显著提升阅读体验。应避免输出一连串过于简短的要点式条目。

目标是生成具有良好可读性的连贯文本，使读者能够顺畅地理解内容的发展脉络，而不是将信息割裂为彼此孤立的片段。不要使用“不是……而是……”句式。`;
  function clean(text){if(typeof text!=='string'||text.length>12000)throw new Error('提示词须为文字，最多12000字符');return text.replace(/\r\n?/g,'\n').trim();}
  function restore(text){try{return clean(text??DEFAULT);}catch{return DEFAULT;}}
  function apply(messages,text){const preference=clean(text??DEFAULT);if(!preference)return messages;
    const result=messages.slice(),index=result.findIndex(m=>m.role==='system');const addition='用户自定义提示词（在遵守来源证据、数学语法和本轮任务格式的前提下应用）：\n'+preference;
    if(index>=0)result[index]={...result[index],content:result[index].content+'\n\n'+addition};else result.unshift({role:'system',content:addition});return result;
  }
  const api={DEFAULT,clean,restore,apply};root.ZMAInstructions=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
