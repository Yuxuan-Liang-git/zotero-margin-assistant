(function(root){
  'use strict';
  function create(reader,anchor,onState,platform){
    const win=reader._window,doc=win.document,frame=reader._iframe,parent=reader._tabContainer||frame?.parentElement;
    if(!parent||!frame)throw new Error('当前阅读器的网页容器尚未就绪');
    const portal=doc.createXULElement('vbox');
    let browser=null,listener=null,crashListener=null,visible=false,destroyed=false,timer=null,raf=null,fallback=null,request=0,readyOnce=false,crashed=false;
    portal.setAttribute('class','zma-notion-native-portal');portal.style.cssText='position:fixed;z-index:11000;min-width:0;min-height:0;overflow:hidden;background:Canvas;';portal.hidden=true;parent.append(portal);
    const align=()=>{if(raf!==null)win.cancelAnimationFrame(raf);raf=null;clearTimeout(fallback);fallback=null;if(destroyed)return;const a=anchor.getBoundingClientRect(),f=frame.getBoundingClientRect(),inner=reader._iframeWindow,sx=f.width/(inner.innerWidth||f.width),sy=f.height/(inner.innerHeight||f.height);
      const shown=visible&&anchor.isConnected&&a.width>0&&a.height>0&&f.width>0&&f.height>0;portal.hidden=!shown;if(!shown)return;
      portal.style.left=(f.left+a.left*sx)+'px';portal.style.top=(f.top+a.top*sy)+'px';portal.style.width=a.width*sx+'px';portal.style.height=a.height*sy+'px';
    };
    const schedule=()=>{if(raf===null&&!destroyed){raf=win.requestAnimationFrame(align);fallback=setTimeout(align,100);}};
    const clear=()=>{clearTimeout(timer);timer=null;};
    const available=()=>!!browser?.isConnected&&!!browser.frameLoader&&!!browser.browsingContext&&(!browser.isRemoteBrowser||!!browser.frameLoader.remoteTab);
    const remoteLost=()=>!!browser?.isRemoteBrowser&&!browser.frameLoader?.remoteTab;
    const detach=()=>{if(!browser)return;if(listener)try{browser.removeProgressListener(listener);}catch{/* A stopped content process no longer owns a progress listener. */}if(crashListener)browser.removeEventListener('oop-browser-crashed',crashListener);listener=null;crashListener=null;browser.remove();};
    const listen=()=>{
      if(listener||!available())return;
      const target=browser;
      const next={QueryInterface:platform.generateQI(['nsIWebProgressListener','nsISupportsWeakReference']),onStateChange(progress,_event,flags,status){if(destroyed||target!==browser||!progress.isTopLevel||!(flags&platform.STATE_STOP)||target.currentURI?.spec==='about:blank')return;clear();if(status===platform.BINDING_ABORTED)return;onState({loading:false,error:!!status});schedule();},onLocationChange(){if(target===browser)schedule();},onProgressChange(){},onStatusChange(){},onSecurityChange(){},onContentBlockingEvent(){}};
      target.addProgressListener(next,platform.NOTIFY_STATE_NETWORK);listener=next;
    };
    const install=()=>{
      detach();readyOnce=false;crashed=false;
      browser=doc.createXULElement('browser');
      for(const [name,value]of Object.entries({type:'content',remote:'false',maychangeremoteness:'true',disableglobalhistory:'true',flex:'1',messagemanagergroup:'zma-notion'}))browser.setAttribute(name,value);
      browser.setAttribute('aria-label','Notion 网页');browser.style.cssText='min-width:0;min-height:0;width:100%;height:100%;';portal.append(browser);
      const target=browser;
      crashListener=()=>{if(destroyed||target!==browser)return;crashed=true;clear();onState({loading:false,error:true,crashed:true});schedule();};
      browser.addEventListener('oop-browser-crashed',crashListener);listen();
    };
    const cancelled=()=>{const error=new Error('Notion 网页加载已取消');error.name='AbortError';return error;};
    const waitReady=async token=>{
      const deadline=Date.now()+5000;
      while(true){
        if(destroyed||token!==request)throw cancelled();
        if(available()){listen();return;}
        if(Date.now()>=deadline)throw new Error('Notion 网页浏览器尚未就绪，请通过标题栏菜单刷新或重新打开。');
        await new Promise(resolve=>setTimeout(resolve,25));
      }
    };
    install();
    const observer=new win.ResizeObserver(schedule);observer.observe(anchor);observer.observe(frame);win.addEventListener('resize',schedule);reader._iframeWindow.addEventListener('resize',schedule);anchor.ownerDocument.addEventListener('scroll',schedule,true);
    return {get browser(){return browser;},portal,align,
      setVisible(value){visible=!!value;align();},
      async load(url){
        if(destroyed)throw new Error('Notion 网页已关闭');
        const token=++request;clear();onState({loading:true});
        try{
          // Gecko keeps a remote browser element after its content process dies.
          // Its RemoteWebNavigation cannot load while frameLoader.remoteTab is null.
          if(crashed||readyOnce&&(!browser.isConnected||remoteLost()))install();
          await waitReady(token);readyOnce=true;
          timer=setTimeout(()=>{if(!destroyed&&token===request)onState({loading:false,error:true});},45000);
          try{await platform.load(browser,url);}
          catch(error){
            if(destroyed||token!==request)throw cancelled();
            // Remoteness may change between the readiness check and navigation.
            if(!remoteLost())throw error;
            clear();install();await waitReady(token);readyOnce=true;
            timer=setTimeout(()=>{if(!destroyed&&token===request)onState({loading:false,error:true});},45000);
            await platform.load(browser,url);
          }
          if(destroyed||token!==request)throw cancelled();schedule();
        }catch(error){if(token===request&&!destroyed){clear();onState({loading:false,error:true});}throw error;}
      },
      destroy(){if(destroyed)return;destroyed=true;request++;clear();clearTimeout(fallback);if(raf!==null)win.cancelAnimationFrame(raf);observer.disconnect();win.removeEventListener('resize',schedule);reader._iframeWindow?.removeEventListener('resize',schedule);anchor.ownerDocument.removeEventListener('scroll',schedule,true);detach();portal.remove();}
    };
  }
  const api={create};root.ZMANotionBrowser=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
