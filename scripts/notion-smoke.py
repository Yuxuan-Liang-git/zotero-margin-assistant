"""Isolated native Notion browser and custom-prompt acceptance.

Uses a local website for editing/state/CSP checks. Optionally loads the public
Notion login page; never signs in or writes to a real Notion page.
"""
import argparse,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);parser.add_argument('--live-login',action='store_true');args=parser.parse_args()
subprocess.run([sys.executable,str(project/'scripts/reading-summary-smoke.py'),'--run-name',args.run_name],check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as z:manifest=z.read('manifest.json');bootstrap=z.read('bootstrap.js').decode()
insertion=r'''
    await check('notion-sidebar-native',async()=>{
      const url='https://www.notion.so/QA-paper-0123456789abcdef0123456789abcdef';
      if(!seed.notionAttachmentID){const link=new Zotero.Item('attachment');link.libraryID=Zotero.Libraries.userLibraryID;link.parentID=seed.parentID;link.attachmentLinkMode=Zotero.Attachments.LINK_MODE_LINKED_URL;link.setField('title','Notion');link.setField('url',url);await link.saveTx();seed.notionAttachmentID=link.id;}
      const links=await host.notionLinks(reader);if(links.length!==1||links[0].url!==url)throw Error('Notero-compatible attachment was not resolved');
      const {HttpServer}=ChromeUtils.importESModule('chrome://remote/content/server/httpd.sys.mjs'),server=new HttpServer();let beacon='',hits=0,cookieOnFirstRequest='';
      server.registerPathHandler('/page',(request,response)=>{
        hits++;if(hits===1)try{cookieOnFirstRequest=request.getHeader('Cookie');}catch{}
        response.setStatusLine(request.httpVersion,200,'OK');response.setHeader('Content-Type','text/html; charset=utf-8',false);response.setHeader('Cache-Control','no-store',false);response.setHeader('X-Frame-Options','DENY',false);response.setHeader('Content-Security-Policy',"frame-ancestors 'none'",false);response.setHeader('Set-Cookie','zma_notion_qa=ready; Path=/; Max-Age=86400; SameSite=Lax',false);
        response.write('<!doctype html><meta charset="utf-8"><title>Native Notion QA</title><h1>论文笔记</h1><textarea id="editor">网页笔记内容</textarea><script>const f=document.getElementById("editor");f.value="本地网页编辑状态";fetch("/loaded?top="+(window.top===window)+"&priv="+typeof Zotero+"&value="+encodeURIComponent(f.value));</script>');
      });
      server.registerPathHandler('/loaded',(request,response)=>{beacon=request.queryString;response.setStatusLine(request.httpVersion,200,'OK');response.write('ok');});server.start(-1);
      const local='http://127.0.0.1:'+server.identity.primaryPort+'/page',factory=host.notionBrowser,viewPanel=await host.panel(reader),win=reader._iframeWindow,doc=win.document,style=doc.documentElement.style,oldWidth=style.getPropertyValue('--zma-assistant-user-width'),tick=()=>new Promise(r=>setTimeout(r,70));let loads=0,adapter,rawLoad,liveLogin=null;
      try{
        host.notionBrowser=(r,anchor,onState)=>{adapter=factory(r,anchor,onState);rawLoad=adapter.load.bind(adapter);adapter.load=target=>{if(target!==url)throw Error('Unexpected linked page');loads++;beacon='';rawLoad(local);};return adapter;};
        await reader.focus();await viewPanel.showNotion();for(let i=0;i<160&&!beacon;i++)await tick();if(!beacon.includes('top=true&priv=undefined')||!beacon.includes('value='))throw Error('Native site isolation or rendering failed: '+beacon);
        if(adapter.portal.hidden||viewPanel.notion.node.hidden)throw Error('Native Notion page is hidden');
        const waitForAlignment=async stage=>{
          for(let i=0;i<40;i++){
            const rect=adapter.portal.getBoundingClientRect(),anchor=viewPanel.notion.viewport.getBoundingClientRect(),frame=reader._iframe.getBoundingClientRect();
            if(Math.abs(rect.left-frame.left-anchor.left)<=3&&Math.abs(rect.top-frame.top-anchor.top)<=3&&Math.abs(rect.width-anchor.width)<=3&&Math.abs(rect.height-anchor.height)<=3)return;
            await tick();
          }
          throw Error('Native browser did not follow the content viewport: '+JSON.stringify({stage,rect:adapter.portal.getBoundingClientRect().toJSON(),anchor:viewPanel.notion.viewport.getBoundingClientRect().toJSON(),frame:reader._iframe.getBoundingClientRect().toJSON(),inner:{width:win.innerWidth,height:win.innerHeight},hidden:adapter.portal.hidden,menuHidden:viewPanel.notion.menu.hidden}));
        };
        await waitForAlignment('initial');
        const firstWindow=adapter.browser.browsingContext.currentWindowGlobal.innerWindowId,rect=adapter.portal.getBoundingClientRect(),anchor=viewPanel.notion.viewport.getBoundingClientRect(),frame=reader._iframe.getBoundingClientRect();
        if(rect.width<200||rect.height<120||Math.abs(rect.left-frame.left-anchor.left)>3||Math.abs(rect.top-frame.top-anchor.top)>3)throw Error('Native browser is not aligned to sidebar: '+JSON.stringify({rect:rect.toJSON(),anchor:anchor.toJSON(),frame:frame.toJSON()}));
        viewPanel.close();await tick();if(adapter.portal.hidden)throw Error('Closing assistant also hid Notion');viewPanel.notion.hide();if(!adapter.portal.hidden)throw Error('Closing Notion left a webpage overlay');await viewPanel.showNotion();viewPanel.open();await tick();await tick();
        if(loads!==1||adapter.portal.hidden||adapter.browser.browsingContext.currentWindowGlobal.innerWindowId!==firstWindow)throw Error('Reopening lost the webpage instance');
        viewPanel.showChat();if(adapter.portal.hidden)throw Error('Chat hid independent Notion');viewPanel.showReadingSummary();if(adapter.portal.hidden)throw Error('Summary hid independent Notion');await viewPanel.showNotion();await tick();
        style.setProperty('--zma-assistant-user-width','600px');await tick();await tick();const resized=adapter.portal.getBoundingClientRect(),target=viewPanel.notion.viewport.getBoundingClientRect();if(Math.abs(resized.width-target.width)>3)throw Error('Browser did not follow sidebar width');
        host.unwrap(reader._internalReader).toggleFindPopup({open:true});await tick();await tick();const search=doc.querySelector('.find-popup input');if(!search)throw Error('PDF search missing');search.focus();const searchRect=doc.querySelector('.find-popup').getBoundingClientRect(),searchView=doc.querySelector('.split-view,#split-view').getBoundingClientRect();if(doc.activeElement!==search||searchRect.left<searchView.left-1||searchRect.right>searchView.right+1)throw Error('PDF search blocked by Notion');
        await viewPanel.notion.show(true);for(let i=0;i<160&&!beacon;i++)await tick();if(loads!==2||hits!==2)throw Error('Explicit refresh failed');if(seed.launch>1&&!cookieOnFirstRequest.includes('zma_notion_qa=ready'))throw Error('Web cookie did not survive cold restart');
        if(seed.launch>1&&host.dockLayoutAPI().state().assistantSide!=='left')throw Error('Dock placement did not survive cold restart');
        const dragDock=side=>{const header=viewPanel.docks.entries.get('assistant').header,start=header.getBoundingClientRect().left+35,end=side==='left'?25:win.innerWidth-25;for(const [type,x] of [['pointerdown',start],['pointermove',end],['pointerup',end]])header.dispatchEvent(new win.PointerEvent(type,host.cloneInto({bubbles:true,cancelable:true,button:0,pointerId:17,clientX:x,clientY:55},win)));};
        dragDock('right');await tick();dragDock('left');await tick();
        await waitForAlignment('after-drag');
        const assistantRect=viewPanel.node.getBoundingClientRect(),notionRect=viewPanel.notion.node.getBoundingClientRect(),pdfRect=doc.querySelector('.split-view,#split-view').getBoundingClientRect(),nativeRect=adapter.portal.getBoundingClientRect(),notionViewport=viewPanel.notion.viewport.getBoundingClientRect();
        if(assistantRect.left!==0||Math.abs(notionRect.right-win.innerWidth)>2||pdfRect.left<assistantRect.right-2||pdfRect.right>notionRect.left+2||Math.abs(nativeRect.left-frame.left-notionViewport.left)>3||adapter.browser.browsingContext.currentWindowGlobal.innerWindowId===undefined)throw Error('Dock drag did not align independent columns');
        if(!viewPanel.commandMenu.hidden||!viewPanel.notion.menu.hidden||viewPanel.notion.header.getBoundingClientRect().height>40)throw Error('Dock controls are not compact');
        viewPanel.notion.menuButton.click();await tick();if(viewPanel.notion.menu.hidden)throw Error('Notion command menu did not open');await waitForAlignment('menu-open');viewPanel.notion.menuButton.click();await tick();await waitForAlignment('menu-close');
        viewPanel.close();viewPanel.notion.hide();doc.querySelector('.zma-notion-toolbar').click();for(let i=0;i<50&&!viewPanel.notion.visible;i++)await tick();if(!viewPanel.node.hidden||!viewPanel.notion.visible)throw Error('Notion toolbar also opened assistant');doc.querySelector('.zma-toolbar').click();for(let i=0;i<50&&viewPanel.node.hidden;i++)await tick();if(viewPanel.node.hidden||!viewPanel.notion.visible)throw Error('Assistant toolbar did not preserve Notion');
        if(__LIVE_LOGIN__&&seed.launch===1){rawLoad('https://www.notion.so/login');for(let i=0;i<250;i++){await tick();const title=adapter.browser.browsingContext.currentWindowGlobal?.documentTitle||'';if(/notion/i.test(title)&&!adapter.browser.webProgress.isLoadingDocument){liveLogin={reached:true,title,uri:adapter.browser.currentURI.spec};break;}}liveLogin??={reached:false,title:adapter.browser.browsingContext.currentWindowGlobal?.documentTitle||'',uri:adapter.browser.currentURI?.spec};}
        return {independentDocks:true,dockDrag:true,compactMenus:true,independentToolbar:true,dockColdRestored:seed.launch>1,noteroAttachment:true,nativeBrowser:true,remoteSiteIsolated:true,iframeDenyPageRenders:true,alignedToSidebar:true,widthFollows:true,searchVisible:true,closeReopenRetainsWindow:true,chatAndSummarySwitch:true,explicitRefresh:true,cookieColdRestored:seed.launch>1,liveLogin,privatePageLoginAndEditing:'not tested; no authentication performed',userDataUnchanged:true};
      }finally{host.notionBrowser=factory;host.unwrap(reader._internalReader).toggleFindPopup({open:false});if(oldWidth)style.setProperty('--zma-assistant-user-width',oldWidth);else style.removeProperty('--zma-assistant-user-width');viewPanel.showChat();viewPanel.notion.destroy();if(adapter?.portal.isConnected)throw Error('Native browser was not cleaned up');await new Promise(resolve=>server.stop(resolve));}
    });
    await check('custom-prompt-native',async()=>{
      const api=host.promptAPI(),value='原生验证：请使用完整段落，解释必要符号，不使用加粗。';
      if(seed.launch>1&&api.state().text!==value)throw Error('Custom prompt not restored after cold restart');
      await api.save(value);const request=host.prepareMessages([{role:'system',content:'保留来源证据。'},{role:'user',content:'解释公式'}]);if(!request[0].content.includes(value)||!request[0].content.includes('保留来源证据'))throw Error('Prompt not applied to system instructions');
      return {savedWithoutCredentials:true,requestIncludesPrompt:true,sourceRulesRetained:true,coldRestored:seed.launch>1};
    });
'''
insertion=insertion.replace('__LIVE_LOGIN__','true' if args.live_login else 'false')
point='    await host.store.flush();';assert bootstrap.count(point)==1;bootstrap=bootstrap.replace(point,insertion+point)
subprocess.run(['node','--check'],input=bootstrap,text=True,encoding='utf-8',check=True,capture_output=True)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('manifest.json',manifest);z.writestr('bootstrap.js',bootstrap)
