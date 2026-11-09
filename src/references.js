(function(root){
  'use strict';
  const C=root.ZMACore||(typeof require!=='undefined'?require('./core.js'):null);
  function isAllowedAnchor(element){return element.localName==='a'&&!!C.parseSourceLink(element.getAttribute('href'));}
  function cleanAnchor(element){
    const href=element.getAttribute('href');
    for(const attr of Array.from(element.attributes))element.removeAttribute(attr.name);
    if(C.parseSourceLink(href))element.setAttribute('href',href);
  }
  function render(rootElement,value){
    if(value!==undefined)rootElement.textContent=value;
    const doc=rootElement.ownerDocument;
    const nodes=[];const walk=n=>{for(const child of Array.from(n.childNodes)){if(child.nodeType===3)nodes.push(child);else if(child.localName!=='a')walk(child);}};walk(rootElement);
    for(const node of nodes){
      const regex=/<a href="([^"<>]+)">([^<>]*)<\/a>/g;const value=node.nodeValue||'';let match,last=0,found=false;const fragment=doc.createDocumentFragment();
      while((match=regex.exec(value))){
        const href=match[1].replace(/&amp;/g,'&');if(!C.parseSourceLink(href))continue;
        fragment.append(doc.createTextNode(value.slice(last,match.index)));
        const a=doc.createElement('a');a.setAttribute('href',href);
        a.textContent=match[2].replace(/&(amp|lt|gt|quot|#39);/g,(v,k)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[k]));
        fragment.append(a);last=regex.lastIndex;found=true;
      }
      if(found){fragment.append(doc.createTextNode(value.slice(last)));node.replaceWith(fragment);}
    }
  }
  function unformatLink(element){
    if(element.localName!=='a')return false;
    const doc=element.ownerDocument;
    const value=isAllowedAnchor(element)?`<a href="${element.getAttribute('href')}">${C.escapeHTML(element.textContent||'')}</a>`:(element.textContent||'');
    element.replaceWith(doc.createTextNode(value));return true;
  }
  function serializeLinks(rootElement){const clone=rootElement.cloneNode(true);for(const a of clone.querySelectorAll('a'))unformatLink(a);return clone.textContent;}
  const api={render,isAllowedAnchor,cleanAnchor,unformatLink,serializeLinks};root.ZMAReferences=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
