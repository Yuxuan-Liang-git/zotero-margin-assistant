(function(root){
  'use strict';
  async function listen(HttpServer,URLClass,callback){
    const server=new HttpServer();let closed=false;
    server.registerPrefixHandler('/',(request,response)=>{
      response.processAsync();
      void (async()=>{
        let result={status:404};
        try{
          if(request.method==='GET'&&request.getHeader('Host')===`127.0.0.1:${server.identity.primaryPort}`&&request.path==='/auth/callback')result=await callback(new URLClass(request.path+'?'+request.queryString,`http://127.0.0.1:${server.identity.primaryPort}`));
          response.setStatusLine(request.httpVersion,result.status,result.status===200?'OK':'Invalid request');
          response.setHeader('Content-Type','text/html; charset=utf-8',false);response.setHeader('Cache-Control','no-store',false);response.setHeader('Referrer-Policy','no-referrer',false);
          response.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",false);
          response.write(result.status===200?'<!doctype html><meta charset="utf-8"><title>Return to Zotero</title><h1>Return to Zotero</h1><p>Zotero is checking your ChatGPT connection. You can close this tab.</p><script>history.replaceState(null,"","/auth/complete");</script>':'Invalid sign-in request. Return to Zotero and try again.');
        }catch{try{response.setStatusLine(request.httpVersion,400,'Invalid request');}catch{}}
        finally{response.finish();}
      })();
    });
    // Public start binds loopback and registers both localhost and 127.0.0.1.
    // _start(..., '127.0.0.1') omits the IPv4 identity in Gecko's httpd module.
    server.start(-1);
    return {redirectURI:`http://127.0.0.1:${server.identity.primaryPort}/auth/callback`,close:()=>new Promise(resolve=>{if(closed){resolve();return;}closed=true;server.stop(resolve);})};
  }
  root.ZMAChatGPTNative={listen};if(typeof module!=='undefined')module.exports=root.ZMAChatGPTNative;
})(typeof _globalThis!=='undefined'?_globalThis:globalThis);
