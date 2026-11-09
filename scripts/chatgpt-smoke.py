"""Offline native SIWC/provider check; synthetic accounts only, real loopback and OSKeyStore."""
import argparse
from pathlib import Path
import subprocess
import sys
import zipfile

project = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--run-name', required=True)
args = parser.parse_args()
subprocess.run([sys.executable, str(project / 'scripts/clipboard-smoke.py'), '--run-name', args.run_name], check=True)
qa = project / 'evidence' / args.run_name / 'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
    manifest = archive.read('manifest.json')
    bootstrap = archive.read('bootstrap.js').decode()
insertion = r'''
    await check('chatgpt-subscription-native',async()=>{
      const phase=async name=>{report.nativeStage=name;await write();};await phase('start');
      const auth=host.auth,client=host.chatgpt,win=Zotero.getMainWindow();
      if(!auth||!client)throw new Error('ChatGPT provider not installed');
      const restored=!!auth.active()?.accessToken;
      if(seed.launch>1&&(!restored||host.provider!=='chatgpt'))throw new Error('ChatGPT account/provider not restored after cold restart');
      const crypto=win.crypto,encoder=new win.TextEncoder(),keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
      const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='native-qa';await phase('keys-ready');
      const encode=value=>auth.base64(encoder.encode(JSON.stringify(value)));
      let nonce='',tokenCalls=0,requestBody,loopback=false;
      const fakeFetch=async(url,options={})=>{
        const json=value=>new win.Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
        if(url.endsWith('openid-configuration'))return json({issuer:'https://auth.openai.com',authorization_endpoint:'https://auth.openai.com/api/accounts/authorize',token_endpoint:'https://auth.openai.com/api/accounts/oauth/token',jwks_uri:'https://auth.openai.com/.well-known/jwks.json',revocation_endpoint:'https://auth.openai.com/oauth/revoke'});
        if(url.endsWith('jwks.json'))return json({keys:[jwk]});
        if(url.endsWith('/token')){
          tokenCalls++;const unsigned=encode({alg:'RS256',kid:'native-qa'})+'.'+encode({iss:'https://auth.openai.com',aud:'oaiapp_nativeqa',sub:'native-qa-subject',email:'qa@example.invalid',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,nonce});
          const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,encoder.encode(unsigned));
          return json({access_token:'synthetic-access-'+tokenCalls,refresh_token:'synthetic-refresh-'+tokenCalls,id_token:unsigned+'.'+auth.base64(signature),token_type:'Bearer',expires_in:3600,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'});
        }
        if(url.endsWith('/models'))return json({models:[{slug:'native-qa-model',display_name:'Native QA Model',visibility:'list'}]});
        if(url.endsWith('/responses')){
          requestBody=JSON.parse(options.body);if(requestBody.store!==false||requestBody.stream!==true||'max_output_tokens' in requestBody||!JSON.stringify(requestBody.input).includes('当前打开的 PDF'))throw new Error('Responses request lost automatic PDF context or SIWC constraints');
          const text='## Native QA\n\n答案：\\(x=1\\)。';
          return new win.Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:text})+'\n\ndata: '+JSON.stringify({type:'response.completed'})+'\n\n');
        }
        throw new Error('Unexpected synthetic endpoint');
      };
      const originalFetch=auth.fetch,originalClientFetch=client.fetch,originalOpen=auth.openBrowser;let panelForQA,originalDraft;
      try{
        auth.fetch=fakeFetch;client.fetch=fakeFetch;auth.config=null;
        auth.openBrowser=async value=>{
          await phase('loopback-browser-start');
          const url=new win.URL(value);nonce=url.searchParams.get('nonce');const redirect=url.searchParams.get('redirect_uri');report.callbackOrigin=new win.URL(redirect).origin;await write();
          if(!redirect.startsWith('http://127.0.0.1:'))throw new Error('Not a loopback listener');
          const bad=await win.fetch(redirect+'?state=invalid&code=ignored');if(bad.status!==400)throw new Error('Invalid state accepted');await bad.text();await phase('bad-state-rejected');
          const result=await win.fetch(redirect+'?'+new win.URLSearchParams({state:url.searchParams.get('state'),code:'synthetic-code',client_id:'oaiapp_nativeqa'}));loopback=result.status===200;await result.text();
        };
        await phase('sign-in');const timeout=setTimeout(()=>auth.cancelSignIn(),45000);try{await auth.signIn();}finally{clearTimeout(timeout);}await phase('signed-in');await host.setProvider('chatgpt');await client.models();
        const cipher=Zotero.Prefs.get('margincomments.chatgptCredentials');if(!cipher?.startsWith('oskv1:')||cipher.includes('synthetic-access'))throw new Error('Credentials not encrypted');
        auth.active().expiresAt=0;const before=tokenCalls;await Promise.all([auth.accessToken(),auth.accessToken()]);if(tokenCalls!==before+1)throw new Error('Refresh not serialized');
        const panel=await host.panel(reader);panelForQA=panel;originalDraft=panel.conversation().draft;panel.showChat();if(panel.providerSelect.value!=='chatgpt'||panel.modelSelect.value!=='native-qa-model')throw new Error('Native provider/model picker not refreshed');
        panel.question.value='Summarize the current PDF (offline QA)';await phase('pdf-turn');await panel.send();await phase('pdf-turn-finished');
        const answer=panel.conversation().history.at(-1);if(answer.incomplete||answer.provider!=='chatgpt'||!requestBody||!panel.messages.lastElementChild.querySelector('math'))throw new Error('Native ChatGPT PDF turn or math rendering failed: '+panel.status.textContent);
        if(!loopback)throw new Error('Actual native callback not used');
        return {officialFlowMocked:true,realLoopbackHttpServer:true,stateRejected:true,webcryptoSignatureValidated:true,encryptedOSKeyStore:true,serializedRefresh:true,accountModelPicker:true,automaticPdfContext:true,markdownAndMath:true,restoredAfterRestart:restored,coldRestart:seed.launch>1,noExternalApiCalls:true};
      }finally{auth.fetch=originalFetch;client.fetch=originalClientFetch;auth.openBrowser=originalOpen;if(panelForQA){panelForQA.conversation().draft=originalDraft;panelForQA.question.value=originalDraft;await panelForQA.persist();}}
    });
'''
point = '    await host.store.flush();'
if bootstrap.count(point) != 1:
    raise RuntimeError('Unexpected QA integration point')
bootstrap = bootstrap.replace(point, insertion + '\n' + point)
with zipfile.ZipFile(qa, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json', manifest)
    archive.writestr('bootstrap.js', bootstrap)
