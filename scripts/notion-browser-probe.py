"""Read-only browser feasibility probe inside a fresh isolated Zotero profile."""
import argparse, subprocess, sys, zipfile
from pathlib import Path
project = Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);args=parser.parse_args()
subprocess.run([sys.executable,str(project/'scripts/pdf-history-smoke.py'),'--run-name',args.run_name],check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as z: manifest=z.read('manifest.json');bootstrap=z.read('bootstrap.js').decode()
insertion=r'''
    await check('native-notion-browser-feasibility',async()=>{
      const {HttpServer}=ChromeUtils.importESModule('chrome://remote/content/server/httpd.sys.mjs'),server=new HttpServer();let beacon=null;
      server.registerPathHandler('/page',(request,response)=>{response.setStatusLine(request.httpVersion,200,'OK');response.setHeader('Content-Type','text/html; charset=utf-8',false);response.setHeader('X-Frame-Options','DENY',false);response.setHeader('Content-Security-Policy',"frame-ancestors 'none'",false);response.write('<!doctype html><title>Notion container QA</title><textarea id="editor">Native web note</textarea><script>document.documentElement.dataset.top=String(window.top===window);document.documentElement.dataset.privileged=typeof Zotero;fetch("/result?top="+document.documentElement.dataset.top+"&priv="+typeof Zotero);</script>');});
      server.registerPathHandler('/result',(request,response)=>{beacon=request.queryString;response.setStatusLine(request.httpVersion,200,'OK');response.write('ok');});server.start(-1);const url='http://127.0.0.1:'+server.identity.primaryPort+'/page',results=[];
      try{
        for(const [name,doc,parent] of [['reader-document',reader._iframeWindow.document,panel.node],['chrome-document',reader._window.document,reader._iframe.parentElement]]){
          beacon=null;let browser;try{browser=doc.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul','browser');browser.setAttribute('type','content');browser.setAttribute('remote','false');browser.setAttribute('maychangeremoteness','true');browser.style.cssText='position:fixed;right:10px;top:150px;width:460px;height:550px;z-index:20000;';parent.append(browser);
            if(typeof browser.loadURI!=='function'){results.push({name,loadURI:false});continue;}
            browser.loadURI(Services.io.newURI(url),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
            for(let i=0;i<200&&!beacon;i++)await new Promise(r=>setTimeout(r,25));
            const html=browser.contentDocument?.documentElement,editor=browser.contentDocument?.getElementById('editor');results.push({name,loadURI:true,editor:!!editor,top:html?.dataset.top,privileged:html?.dataset.privileged,beacon,remote:browser.isRemoteBrowser,title:browser.browsingContext?.currentWindowGlobal?.documentTitle,uri:browser.currentURI?.spec});
          }catch(e){results.push({name,error:String(e)});}finally{browser?.remove();}
        }
      }finally{await new Promise(resolve=>server.stop(resolve));}
      if(!results.some(r=>r.beacon==='top=true&priv=undefined'))throw Error(JSON.stringify(results));return {results};
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1;bootstrap=bootstrap.replace(point,insertion+point)
subprocess.run(['node','--check'],input=bootstrap,text=True,encoding='utf-8',check=True,capture_output=True)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('manifest.json',manifest);z.writestr('bootstrap.js',bootstrap)
