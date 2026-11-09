(function(root){
  'use strict';
  // Construct known Markdown nodes; raw HTML and remote images remain inert text.
  function render(node,value,renderMath){
    const doc=node.ownerDocument,math=[];
    const protectedText=String(value).replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$(?!\$)[^$\n]+?\$/g,m=>{const i=math.push(m)-1;return `\uE000ZMA${i}\uE001`;});
    const restore=s=>String(s||'').replace(/\uE000ZMA(\d+)\uE001/g,(_,i)=>math[Number(i)]||'');
    const el=tag=>doc.createElementNS('http://www.w3.org/1999/xhtml',tag);
    const plain=(parent,text,allowMath=true)=>{const span=el('span'),content=restore(text);if(allowMath&&renderMath)renderMath(span,content);else span.textContent=content;parent.append(span);};
    const inline=(parent,tokens)=>{
      for(const t of tokens||[]){
        if(['strong','em','del'].includes(t.type)){const child=el(t.type);inline(child,t.tokens);parent.append(child);}
        else if(t.type==='codespan'){const code=el('code');code.textContent=restore(t.text);parent.append(code);}
        else if(t.type==='br')parent.append(el('br'));
        else if(t.type==='link'){
          const href=restore(t.href),safe=/^https?:\/\//i.test(href)||root.ZMACore?.parseSourceLink(href);
          const child=el(safe?'a':'span');if(safe){child.setAttribute('href',href);child.setAttribute('rel','noopener noreferrer');}inline(child,t.tokens);parent.append(child);
        }else if(t.type==='image'||t.type==='html')plain(parent,t.text||t.raw,false);
        else if(t.tokens)inline(parent,t.tokens);else plain(parent,t.text||t.raw);
      }
    };
    const blocks=(parent,tokens)=>{
      for(const t of tokens||[]){
        if(t.type==='space')continue;
        if(t.type==='hr'){parent.append(el('hr'));continue;}
        if(t.type==='code'){const pre=el('pre'),code=el('code');code.textContent=restore(t.text);pre.append(code);parent.append(pre);continue;}
        if(t.type==='blockquote'){const q=el('blockquote');blocks(q,t.tokens);parent.append(q);continue;}
        if(t.type==='list'){
          const list=el(t.ordered?'ol':'ul');if(t.ordered&&Number.isSafeInteger(t.start))list.setAttribute('start',String(t.start));
          for(const item of t.items){const li=el('li');if(item.task)li.append(doc.createTextNode(item.checked?'☑ ':'☐ '));blocks(li,item.tokens);list.append(li);}parent.append(list);continue;
        }
        if(t.type==='table'){
          const table=el('table'),thead=el('thead'),body=el('tbody');
          const row=(cells,tag)=>{const tr=el('tr');for(const cell of cells){const td=el(tag);inline(td,cell.tokens);tr.append(td);}return tr;};
          thead.append(row(t.header,'th'));for(const cells of t.rows)body.append(row(cells,'td'));table.append(thead,body);const wrap=el('div');wrap.setAttribute('class','zma-table-wrap');wrap.append(table);parent.append(wrap);continue;
        }
        if(t.type==='html'){plain(parent,t.text||t.raw,false);continue;}
        const block=el(t.type==='heading'?`h${t.depth}`:'p');if(t.tokens)inline(block,t.tokens);else plain(block,t.text||t.raw);parent.append(block);
      }
    };
    node.replaceChildren();node.classList.add('zma-markdown');
    const parser=root.marked||globalThis.marked;
    if(parser?.lexer)blocks(node,parser.lexer(protectedText,{gfm:true,breaks:true}));else plain(node,value);
  }
  root.ZMAMarkdown={render};
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
