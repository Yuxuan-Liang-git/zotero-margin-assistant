(function(root){
  'use strict';
  const pagePattern=/([0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/?$/i;
  function normalizeURL(value){
    if(typeof value!=='string'||value.length>4096)return null;
    try{const url=new URL(value.replace(/^notion:/i,'https:')),host=url.hostname.toLowerCase();
      if(url.protocol!=='https:'||url.username||url.password||url.port||!(host==='notion.so'||host.endsWith('.notion.so')||['notion.com','www.notion.com','app.notion.com'].includes(host)||host.endsWith('.notion.site'))||!pagePattern.test(url.pathname))return null;
      return url.href;
    }catch{return null;}
  }
  async function linksForReader(Z,reader){
    const pdf=Z.Items.get(Number(reader.itemID)),parent=pdf?.parentID?Z.Items.get(pdf.parentID):null;
    if(!pdf||pdf.deleted||!parent||parent.deleted||parent.libraryID!==pdf.libraryID)return [];
    const seen=new Set(),links=[];
    for(const id of [...parent.getAttachments(false)].sort((a,b)=>b-a)){
      const attachment=Z.Items.get(id);if(!attachment||attachment.deleted||attachment.libraryID!==pdf.libraryID||attachment.isAttachment?.()===false)continue;
      const url=normalizeURL(attachment.getField('url'));if(!url)continue;
      const parsed=new URL(url),pageID=pagePattern.exec(parsed.pathname)[1].replace(/-/g,'').toLowerCase(),key=pageID+parsed.hash;
      if(seen.has(key))continue;seen.add(key);links.push({id:attachment.id,url,title:String(attachment.getField('title')||'Notion 笔记').slice(0,300),pageID});
    }
    return links;
  }
  class NotionView{
    constructor(panel){
      this.panel=panel;this.host=panel.host;this.visible=false;this.request=0;const {el,button}=root.ZMAPanel,doc=panel.doc;
      this.node=el(doc,'section',undefined,'zma-notion-view');this.node.hidden=true;
      this.heading=el(doc,'h3','Notion 笔记');this.selection=el(doc,'select');this.selection.setAttribute('aria-label','关联的 Notion 页面');this.selection.hidden=true;
      this.message=el(doc,'p','打开当前文献关联的 Notion 页面。','zma-notion-status');this.message.setAttribute('role','status');
      const actions=el(doc,'div',undefined,'zma-actions');this.external=button(doc,'在浏览器打开',()=>{if(this.selected)this.host.openExternal(this.selected.url);});this.external.disabled=true;
      actions.append(button(doc,'返回对话',()=>panel.showChat()),button(doc,'重新检测 / 刷新',()=>this.show(true)),this.external);
      this.hint=el(doc,'p','首次使用请在网页内登录 Notion；Notero 的同步授权与网页登录分开。','zma-notion-hint');
      this.viewport=el(doc,'div',undefined,'zma-notion-viewport');this.node.append(this.heading,this.selection,actions,this.message,this.hint,this.viewport);
      this.selection.addEventListener('change',()=>{const link=this.links?.find(l=>String(l.id)===this.selection.value);if(link)void this.load(link).catch(e=>this.fail(e));});
    }
    fail(error){if(this.destroyed)return;this.message.textContent=error.message||'Notion 页面未能打开，可重新检测或在浏览器打开。';}
    state(info){if(this.destroyed)return;this.message.textContent=info.error?'页面未能载入，可刷新或在浏览器打开。':info.loading?'正在载入 Notion…':'已打开关联页面，可在网页中查看与编辑。';}
    async show(refresh=false){
      if(this.destroyed)return;this.visible=true;this.node.hidden=false;const token=++this.request;this.message.textContent='正在查找当前文献的 Notion 链接…';
      try{const links=await this.host.notionLinks(this.panel.reader);if(this.destroyed||!this.visible||token!==this.request)return;this.links=links;
        const selected=links.find(l=>l.id===this.selected?.id)||links[0];this.selection.replaceChildren();this.selection.hidden=links.length<2;
        for(const [i,link]of links.entries()){const option=root.ZMAPanel.el(this.panel.doc,'option',link.title+(links.length>1?' · '+(i+1):''));option.value=String(link.id);option.title=link.url;this.selection.append(option);}
        if(!selected){this.selected=null;this.external.disabled=true;this.browser?.setVisible(false);this.message.textContent='当前文献没有找到 Notion 链接。请先用 Notero 关联此文献，然后重新检测。';return;}
        this.selection.value=String(selected.id);await this.load(selected,refresh);
      }catch(e){if(token===this.request&&this.visible)this.fail(e);}
    }
    async load(link,refresh=false){
      const url=normalizeURL(link.url);if(!url)throw new Error('关联地址不是有效的 Notion 页面');if(this.destroyed||!this.visible)return;
      this.selected={...link,url};this.external.disabled=false;
      if(!this.browser)this.browser=this.host.createNotionBrowser(this.panel.reader,this.viewport,info=>this.state(info));
      this.browser.setVisible(true);
      if(this.loadedURL!==url||refresh){this.message.textContent='正在载入 Notion…';await this.browser.load(url);this.loadedURL=url;}else this.message.textContent='已恢复关联页面，网页内容与输入状态保留。';
      if(!this.visible||this.destroyed)this.browser.setVisible(false);
    }
    hide(){this.visible=false;this.request++;this.node.hidden=true;this.browser?.setVisible(false);}
    destroy(){this.destroyed=true;this.hide();this.browser?.destroy();this.browser=null;this.node.remove();}
  }
  const api={normalizeURL,linksForReader,NotionView};root.ZMANotion=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
