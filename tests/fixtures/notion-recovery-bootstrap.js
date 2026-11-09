
function install(){}function uninstall(){}function shutdown(){}function startup(){setTimeout(run,500);}
async function run(){const work=__WORK__,report={phase:'starting',cases:[]};const write=()=>IOUtils.writeUTF8(PathUtils.join(work,'report.json'),JSON.stringify(report,null,2));let server;
try{await write();await Zotero.initializationPromise;await Zotero.uiReadyPromise;if(Zotero.DataDirectory.dir!==__DATA__)throw Error('Wrong data directory');report.zotero=Zotero.version;report.process=Services.appinfo.processID;await write();
const win=Zotero.getMainWindow(),doc=win.document,ns='http://www.w3.org/1999/xhtml';
const frame=doc.createElementNS(ns,'iframe');frame.setAttribute('src','about:blank');frame.style.cssText='position:fixed;left:0;top:60px;width:1100px;height:700px;';doc.documentElement.append(frame);
const tick=()=>new Promise(r=>setTimeout(r,50));for(let i=0;i<100&&!frame.contentDocument?.body;i++)await tick();
const child=frame.contentDocument,anchor=child.createElement('div');anchor.style.cssText='position:fixed;left:0;top:40px;width:400px;height:500px;';child.body.append(anchor);
const scope={setTimeout,clearTimeout};scope._globalThis=scope;Services.scriptloader.loadSubScript(__SOURCE__,scope);
const {HttpServer}=ChromeUtils.importESModule('chrome://remote/content/server/httpd.sys.mjs');server=new HttpServer();let beacon=0,cookie='',visits=0,recoveryCookieRequest='';
server.registerPathHandler('/page',(req,res)=>{res.setStatusLine(req.httpVersion,200,'OK');res.setHeader('Content-Type','text/html; charset=utf-8',false);res.setHeader('X-Frame-Options','DENY',false);visits++;if(visits===1)res.setHeader('Set-Cookie','zma_recovery=retained; Path=/; SameSite=Lax',false);else try{recoveryCookieRequest=req.getHeader('Cookie');}catch{}res.write('<!doctype html><title>Local Notion recovery</title><p>Isolated browser lifecycle</p><script>fetch("/beacon?cookie="+encodeURIComponent(document.cookie))</script>');});server.registerPathHandler('/beacon',(req,res)=>{beacon++;cookie=req.queryString;res.setStatusLine(req.httpVersion,200,'OK');res.write('ok');});server.start(-1);const url='http://127.0.0.1:'+server.identity.primaryPort+'/page';
const reader={_window:win,_iframe:frame,_iframeWindow:frame.contentWindow,_tabContainer:doc.documentElement};const state=()=>{};
const platform={generateQI:n=>ChromeUtils.generateQI(n),STATE_STOP:Components.interfaces.nsIWebProgressListener.STATE_STOP,NOTIFY_STATE_NETWORK:Components.interfaces.nsIWebProgress.NOTIFY_STATE_NETWORK,BINDING_ABORTED:Components.results.NS_BINDING_ABORTED,load:(b,u)=>b.loadURI(Services.io.newURI(u),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()})};
const adapter=scope.ZMANotionBrowser.create(reader,anchor,state,platform);adapter.setVisible(true);
const snapshot=b=>{let value={remote:b.isRemoteBrowser,remoteAttr:b.getAttribute('remote'),frameLoader:!!b.frameLoader,remoteTab:!!b.frameLoader?.remoteTab,crashed:b.isCrashed,connected:b.isConnected,uri:b.currentURI?.spec};try{value.destroyFrame=typeof b.frameLoader?.destroy;}catch{}return value;};
report.before=snapshot(adapter.browser);await write();
try{await adapter.load(url);for(let i=0;i<100&&!beacon;i++)await tick();report.cases.push({name:'normal',beacon,state:snapshot(adapter.browser)});}catch(e){report.cases.push({name:'normal',error:String(e),stack:e.stack});}
try{const b=adapter.browser;report.remote=snapshot(b);if(beacon!==1)throw Error('Initial local page did not load');await write();
report.remoteProcess=b.frameLoader.remoteTab.osPid;report.phase='waiting-crash';await write();
for(let i=0;i<2400&&b.frameLoader?.remoteTab;i++)await tick();
report.afterDestroy=snapshot(b);await write();
try{await adapter.load(url);for(let i=0;i<100&&beacon<2;i++)await tick();report.cases.push({name:'reload-after-remote-process-loss',loaded:beacon>=2,recreated:adapter.browser!==b,cookieRetained:cookie.includes('zma_recovery%3Dretained')&&recoveryCookieRequest.includes('zma_recovery=retained'),cookieSentOnRecovery:recoveryCookieRequest.includes('zma_recovery=retained'),setCookieResponses:1,state:snapshot(adapter.browser)});}catch(e){report.cases.push({name:'reload-after-remote-process-loss',error:String(e),stack:e.stack});}

}catch(e){report.probeError=String(e);report.probeStack=e.stack;}finally{adapter.destroy();frame.remove();}
report.phase='complete';await write();
}catch(e){report.phase='failed';report.error=String(e);report.stack=e.stack;await write();}finally{if(server)await new Promise(r=>server.stop(r));Services.startup.quit(Services.startup.eForceQuit);}}
