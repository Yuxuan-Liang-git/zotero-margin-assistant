(function(root){
  'use strict';
  function control(node){const element=node?.nodeType===1?node:node?.parentElement;const field=element?.closest('textarea,input');return field&&typeof field.selectionStart==='number'?field:null;}
  function formula(node){const element=node?.nodeType===1?node:node?.parentElement;const math=element?.closest('math');return math?(math.closest('.katex')||math):element?.closest('.katex');}
  function formulaText(node){
    const math=node?.matches('math')?node:node?.querySelector('math');if(!math)return '';
    const raw=math.getAttribute('data-zma-latex');if(raw)return raw;
    const source=math.querySelector('annotation[encoding="application/x-tex"]')?.textContent;if(!source)return '';
    return math.getAttribute('display')==='block'?`\\[${source}\\]`:`\\(${source}\\)`;
  }
  function fragmentText(fragment){
    for(const math of Array.from(fragment.querySelectorAll('math'))){if(!fragment.contains(math))continue;const source=formulaText(math),outer=math.closest('.katex')||math;if(source)outer.replaceWith(fragment.ownerDocument.createTextNode(source));}
    fragment.querySelectorAll('button,.zma-actions,script,style,annotation').forEach(node=>node.remove());
    const walk=node=>{
      if(node.nodeType===3)return node.nodeValue||'';
      if(node.nodeType!==1&&node.nodeType!==11)return '';
      if(node.nodeName.toLowerCase()==='br')return '\n';
      let text=Array.from(node.childNodes).map(walk).join('');
      if(/^(p|div|article|blockquote|pre|h[1-6]|li|tr)$/i.test(node.nodeName))text+='\n';
      if(/^(td|th)$/i.test(node.nodeName))text+='\t';return text;
    };
    return walk(fragment).replace(/\n{3,}/g,'\n\n').replace(/^\n+|\n+$/g,'');
  }
  function selectionText(container,target=container.ownerDocument.activeElement){
    const field=control(target);if(field&&container.contains(field))return field.value.slice(field.selectionStart,field.selectionEnd);
    const selection=container.ownerDocument.defaultView.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return '';
    const parts=[];
    for(let i=0;i<selection.rangeCount;i++){
      const range=selection.getRangeAt(i).cloneRange();if(!container.contains(range.startContainer)||!container.contains(range.endContainer))return '';
      const start=formula(range.startContainer),end=formula(range.endContainer);if(start&&container.contains(start))range.setStartBefore(start);if(end&&container.contains(end))range.setEndAfter(end);
      parts.push(fragmentText(range.cloneContents()));
    }
    return parts.join('\n');
  }
  function install(container,{copy,read,onError=(_error)=>{}}){
    const doc=container.ownerDocument,listeners=[];let menu;
    const listen=(node,type,handler)=>{node.addEventListener(type,handler);listeners.push(()=>node.removeEventListener(type,handler));};
    const closeMenu=()=>{menu?.remove();menu=null;};
    const write=(text,event)=>{
      if(!text)return false;let success=false;
      if(event?.clipboardData){event.clipboardData.setData('text/plain',text);success=true;}
      try{if(copy){copy(text);success=true;}}catch(error){if(!success)onError(error);}
      if(success)event?.preventDefault();return success;
    };
    const insert=(field,text)=>{
      if(!field||field.disabled||field.readOnly||typeof text!=='string'||!text)return false;
      field.focus();field.setRangeText(text,field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));return true;
    };
    const paste=field=>{try{return insert(field,read?.());}catch(error){onError(error);return false;}};
    const selectAll=target=>{
      const field=control(target);if(field){field.focus();field.select();return;}
      const answer=(target?.nodeType===1?target:target?.parentElement)?.closest('.zma-answer')||container.querySelector('.zma-messages')||container;
      const range=doc.createRange();range.selectNodeContents(answer);const selection=doc.defaultView.getSelection();selection.removeAllRanges();selection.addRange(range);
    };
    listen(doc,'copy',event=>{if(container.hidden||!container.isConnected)return;const text=selectionText(container,event.target);if(!text&&!container.contains(event.target))return;event.stopPropagation();write(text,event);});
    listen(container,'cut',event=>{event.stopPropagation();const field=control(event.target);if(field&&!field.readOnly&&!field.disabled&&write(selectionText(container,field),event)){field.setRangeText('',field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));}});
    listen(container,'paste',event=>{event.stopPropagation();const field=control(event.target),text=event.clipboardData?.getData('text/plain');if(insert(field,text))event.preventDefault();});
    listen(container,'keydown',event=>{
      if(event.isComposing)return;const key=event.key.toLowerCase(),modifier=(event.ctrlKey||event.metaKey)&&!event.altKey;
      if(!modifier||!['a','c','x','v'].includes(key))return;
      event.stopPropagation();
      if(key==='a'){event.preventDefault();selectAll(event.target);}
      else if(key==='c'){event.preventDefault();write(selectionText(container,event.target));}
      else if(key==='x'){const field=control(event.target);if(field&&!field.readOnly&&!field.disabled&&write(selectionText(container,field))){event.preventDefault();field.setRangeText('',field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));}}
      else if(paste(control(event.target)))event.preventDefault();
    });
    for(const type of ['pointerdown','mousedown','click','dblclick'])listen(container,type,event=>{if(type==='pointerdown'&&menu&&!menu.contains(event.target))closeMenu();event.stopPropagation();});
    listen(container,'contextmenu',event=>{
      if(event.target.closest?.('.zma-clipboard-menu'))return;event.preventDefault();event.stopPropagation();closeMenu();
      const field=control(event.target),math=formula(event.target),selected=selectionText(container,event.target);
      menu=doc.createElementNS('http://www.w3.org/1999/xhtml','div');menu.className='zma-clipboard-menu';menu.setAttribute('role','group');menu.setAttribute('aria-label','文档助手编辑菜单');
      Object.assign(menu.style,{position:'fixed',zIndex:'10010',background:'Canvas',color:'CanvasText',border:'1px solid #999',padding:'5px',borderRadius:'5px',left:`${Math.max(0,Math.min(event.clientX,doc.defaultView.innerWidth-180))}px`,top:`${Math.max(0,Math.min(event.clientY,doc.defaultView.innerHeight-170))}px`});
      const add=(label,action,disabled=false)=>{const b=doc.createElementNS('http://www.w3.org/1999/xhtml','button');b.type='button';b.textContent=label;b.disabled=disabled;b.style.display='block';b.style.width='100%';b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>{closeMenu();action();});menu.append(b);};
      if(math)add('复制公式 LaTeX',()=>write(formulaText(math)),!formulaText(math));
      add('复制',()=>write(selected),!selected);
      if(field){add('剪切',()=>{if(!field.readOnly&&!field.disabled&&write(selected)){field.setRangeText('',field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));}},field.readOnly||field.disabled||!selected);add('粘贴',()=>paste(field),field.readOnly||field.disabled);}
      add('全选',()=>selectAll(event.target));container.append(menu);
    });
    listen(doc,'pointerdown',event=>{if(menu&&!menu.contains(event.target))closeMenu();});
    return ()=>{closeMenu();listeners.forEach(dispose=>dispose());};
  }
  const api={install,selectionText,formulaText};root.ZMAClipboard=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
