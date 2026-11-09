(function(root){
  'use strict';
  function create(reader,anchor,onState,platform){
    const win=reader._window,doc=win.document,frame=reader._iframe,parent=reader._tabContainer||frame?.parentElement;
    if(!parent||!frame)throw new Error('当前阅读器的网页容器尚未就绪');
    const portal=doc.createXULElement('vbox'),browser=doc.createXULElement('browser');let visible=false,destroyed=false,timer=null,raf=null,fallback=null;
    portal.setAttribute('class','zma-notion-native-portal');portal.style.cssText='position:fixed;z-index:11000;min-width:0;min-height:0;overflow:hidden;background:Canvas;';portal.hidden=true;
    for(const [name,value]of Object.entries({type:'content',remote:'false',maychangeremoteness:'true',disableglobalhistory:'true',flex:'1',messagemanagergroup:'zma-notion'}))browser.setAttribute(name,value);
    browser.setAttribute('aria-label','Notion 网页');browser.style.cssText='min-width:0;min-height:0;width:100%;height:100%;';portal.append(browser);parent.append(portal);
    const align=()=>{if(raf!==null)win.cancelAnimationFrame(raf);raf=null;clearTimeout(fallback);fallback=null;if(destroyed)return;const a=anchor.getBoundingClientRect(),f=frame.getBoundingClientRect(),inner=reader._iframeWindow,sx=f.width/(inner.innerWidth||f.width),sy=f.height/(inner.innerHeight||f.height);
      const shown=visible&&anchor.isConnected&&a.width>0&&a.height>0&&f.width>0&&f.height>0;portal.hidden=!shown;if(!shown)return;
      portal.style.left=(f.left+a.left*sx)+'px';portal.style.top=(f.top+a.top*sy)+'px';portal.style.width=a.width*sx+'px';portal.style.height=a.height*sy+'px';
    };
    const schedule=()=>{if(raf===null&&!destroyed){raf=win.requestAnimationFrame(align);fallback=setTimeout(align,100);}};
    const observer=new win.ResizeObserver(schedule);observer.observe(anchor);observer.observe(frame);win.addEventListener('resize',schedule);reader._iframeWindow.addEventListener('resize',schedule);anchor.ownerDocument.addEventListener('scroll',schedule,true);
    const clear=()=>{clearTimeout(timer);timer=null;};
    const listener={QueryInterface:platform.generateQI(['nsIWebProgressListener','nsISupportsWeakReference']),onStateChange(progress,_request,flags,status){if(destroyed||!progress.isTopLevel||!(flags&platform.STATE_STOP)||browser.currentURI?.spec==='about:blank')return;clear();if(status===platform.BINDING_ABORTED)return;onState({loading:false,error:!!status});schedule();},onLocationChange(){schedule();},onProgressChange(){},onStatusChange(){},onSecurityChange(){},onContentBlockingEvent(){}};
    browser.addProgressListener(listener,platform.NOTIFY_STATE_NETWORK);
    return {browser,portal,align,
      setVisible(value){visible=!!value;align();},
      load(url){if(destroyed)throw new Error('Notion 网页已关闭');clear();onState({loading:true});timer=setTimeout(()=>{if(!destroyed)onState({error:true});},45000);platform.load(browser,url);schedule();},
      destroy(){if(destroyed)return;destroyed=true;clear();clearTimeout(fallback);if(raf!==null)win.cancelAnimationFrame(raf);observer.disconnect();win.removeEventListener('resize',schedule);reader._iframeWindow?.removeEventListener('resize',schedule);anchor.ownerDocument.removeEventListener('scroll',schedule,true);try{browser.removeProgressListener(listener);}catch{}portal.remove();}
    };
  }
  const api={create};root.ZMANotionBrowser=api;if(typeof module!=='undefined')module.exports=api;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
