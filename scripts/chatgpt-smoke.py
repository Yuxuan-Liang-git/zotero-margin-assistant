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
      if(seed.launch>1&&(auth.active()?.reasoningEffort!=='xhigh'||auth.active()?.speed!=='fast'))throw new Error('Reasoning effort/speed not restored');
      if(seed.launch>1&&(!restored||host.provider!=='chatgpt'))throw new Error('ChatGPT account/provider not restored after cold restart');
      const crypto=win.crypto,encoder=new win.TextEncoder(),keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
      const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='native-qa';await phase('keys-ready');
      const encode=value=>auth.base64(encoder.encode(JSON.stringify(value)));
      let nonce='',tokenCalls=0,requestBody,loopback=false,liveMathBeforeCompletion=false,rejectFast=false,rejectReasoning=false,rejectInput=false,rejectOpaque=false,responseCalls=0;
      const fakeFetch=async(url,options={})=>{
        const json=value=>new win.Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
        if(url.endsWith('openid-configuration'))return json({issuer:'https://auth.openai.com',authorization_endpoint:'https://auth.openai.com/api/accounts/authorize',token_endpoint:'https://auth.openai.com/api/accounts/oauth/token',jwks_uri:'https://auth.openai.com/.well-known/jwks.json',revocation_endpoint:'https://auth.openai.com/oauth/revoke'});
        if(url.endsWith('jwks.json'))return json({keys:[jwk]});
        if(url.endsWith('/token')){
          tokenCalls++;const unsigned=encode({alg:'RS256',kid:'native-qa'})+'.'+encode({iss:'https://auth.openai.com',aud:'oaiapp_nativeqa',sub:'native-qa-subject',email:'qa@example.invalid',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,nonce});
          const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,encoder.encode(unsigned));
          return json({access_token:'synthetic-access-'+tokenCalls,refresh_token:'synthetic-refresh-'+tokenCalls,id_token:unsigned+'.'+auth.base64(signature),token_type:'Bearer',expires_in:3600,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'});
        }
        if(url.endsWith('/models'))return json({models:[{slug:'native-qa-model',display_name:'Native QA Model',visibility:'list',supported_reasoning_levels:[{effort:'low'},{effort:'medium'},{effort:'high'},{effort:'xhigh'},{effort:'max'},{effort:'ultra'}],service_tiers:[{id:'priority'},{id:'ultrafast'}]}]});
        if(url.endsWith('/responses')){
          responseCalls++;
          requestBody=JSON.parse(options.body);if(requestBody.store!==false||requestBody.stream!==true||'max_output_tokens' in requestBody||!JSON.stringify(requestBody.input).includes('当前打开的 PDF'))throw new Error('Responses request lost automatic PDF context or SIWC constraints');
          if(rejectFast&&requestBody.service_tier==='priority')return new win.Response(JSON.stringify({error:{code:null,param:'service_tier',message:'service_tier is not allowed; never-leak'}}),{status:400,headers:{'Content-Type':'application/json'}});
          if(rejectReasoning&&requestBody.reasoning)return new win.Response(JSON.stringify({detail:"Unsupported parameter: 'reasoning.effort'. never-leak"}),{status:400,headers:{'Content-Type':'application/json','x-request-id':'req_native_reasoning'}});
          if(rejectInput)return new win.Response(JSON.stringify({detail:[{loc:['body','input',0,'content',1,'file_data'],msg:'never-leak',input:'never-leak'}]}),{status:400,headers:{'Content-Type':'application/json','x-request-id':'req_native_input'}});
          if(rejectOpaque&&(requestBody.service_tier!=='default'||requestBody.tools||requestBody.reasoning))return new win.Response(JSON.stringify({detail:'Direct route rejected this request. Bearer synthetic-access-'+tokenCalls}),{status:400,headers:{'Content-Type':'application/json'}});
          const text='## Native QA\n\n答案：\\(x=1\\)。';
          return new win.Response(new win.ReadableStream({start(controller){
            controller.enqueue(encoder.encode('data: '+JSON.stringify({type:'response.output_text.delta',delta:text})+'\n\n'));
            setTimeout(()=>{liveMathBeforeCompletion=!!panelForQA?.busy&&!!panelForQA.messages.lastElementChild?.querySelector('math');controller.enqueue(encoder.encode('data: '+JSON.stringify({type:'response.completed',response:{service_tier:requestBody.service_tier}})+'\n\n'));controller.close();},700);
          }}));
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
        await phase('sign-in');const timeout=setTimeout(()=>auth.cancelSignIn(),45000);try{await auth.signIn();}finally{clearTimeout(timeout);}await phase('signed-in');await host.setProvider('chatgpt');await client.models();await host.setChatGPTReasoning('xhigh');await host.setChatGPTSpeed('fast');
        const cipher=Zotero.Prefs.get('margincomments.chatgptCredentials');if(!cipher?.startsWith('oskv1:')||cipher.includes('synthetic-access'))throw new Error('Credentials not encrypted');
        auth.active().expiresAt=0;const before=tokenCalls;await Promise.all([auth.accessToken(),auth.accessToken()]);if(tokenCalls!==before+1)throw new Error('Refresh not serialized');
        const panel=await host.panel(reader);panelForQA=panel;originalDraft=panel.conversation().draft;panel.showChat();const controls=host.providerState();if(controls.provider!=='chatgpt'||controls.model!=='native-qa-model'||controls.reasoningEffort!=='xhigh'||controls.speed!=='fast'||!controls.reasoningEfforts.includes('max')||controls.reasoningEfforts.includes('ultra')||panel.node.querySelector('select')||!panel.modelBadge.textContent.includes('ChatGPT'))throw new Error('Native model settings or compact badge not refreshed');
        panel.question.value='Summarize the current PDF (offline QA)';await phase('pdf-turn');await panel.send();await phase('pdf-turn-finished');
        const answer=panel.conversation().history.at(-1);if(answer.incomplete||answer.provider!=='chatgpt'||!requestBody||!panel.messages.lastElementChild.querySelector('math'))throw new Error('Native ChatGPT PDF turn or math rendering failed: '+panel.status.textContent);
        if(!liveMathBeforeCompletion||requestBody.reasoning?.effort!=='xhigh'||requestBody.service_tier!=='priority'||!panel.status.textContent.includes('本轮档位：快速 Fast'))throw new Error('Live math or selected effort not applied');
        rejectFast=true;panel.question.value='Retry Standard (offline QA)';const beforeReject=responseCalls;await panel.send();
        const retry=panel.messages.lastElementChild.querySelector('.zma-retry-standard');
        if(!retry||responseCalls!==beforeReject+1||!panel.status.textContent.includes('service_tier')||panel.status.textContent.includes('never-leak'))throw new Error('Speed rejection diagnostics or explicit retry missing');
        retry.click();for(let n=0;n<200;n++){await new Promise(r=>setTimeout(r,50));if(!panel.busy&&responseCalls===beforeReject+2)break;}
        if(panel.conversation().history.at(-1).incomplete||responseCalls!==beforeReject+2||requestBody.service_tier!=='default'||!panel.status.textContent.includes('本轮档位：标准'))throw new Error('Native Standard retry failed');
        rejectReasoning=true;panel.question.value='Retry default effort (offline QA)';const beforeReasoning=responseCalls;await panel.send();
        const reasoningRetry=panel.messages.lastElementChild.querySelector('.zma-retry-reasoning');if(!reasoningRetry||responseCalls!==beforeReasoning+1||!panel.status.textContent.includes('reasoning.effort'))throw new Error('Reasoning rejection or explicit retry missing');
        reasoningRetry.click();for(let n=0;n<200;n++){await new Promise(r=>setTimeout(r,50));if(!panel.busy&&responseCalls===beforeReasoning+2)break;}
        if(panel.conversation().history.at(-1).incomplete||requestBody.reasoning||auth.active().reasoningEffort!=='default')throw new Error('Native default reasoning retry failed');
        rejectReasoning=false;rejectInput=true;panel.question.value='Keep this rejected document question (offline QA)';const beforeInput=responseCalls;await panel.send();
        const diagnosticButton=panel.messages.lastElementChild.querySelector('.zma-error-diagnostic');if(!diagnosticButton||responseCalls!==beforeInput+1||!panel.question.value.includes('Keep this')||!panel.status.textContent.includes('file_data'))throw new Error('Native input rejection lost draft or diagnostics');
        let copied='';const originalCopy=host.copy;try{host.copy=value=>{copied=value;};diagnosticButton.click();for(let n=0;n<20&&!copied;n++)await new Promise(r=>setTimeout(r,25));}finally{host.copy=originalCopy;}
        const diagnostic=JSON.parse(copied);if(diagnostic.requestID!=='req_native_input'||diagnostic.responseShape!=='validation-list'||diagnostic.param!=='input[0].content[1].file_data'||diagnostic.request.model!=='native-qa-model'||copied.includes('never-leak')||copied.includes('Keep this'))throw new Error('Native safe diagnostic copy failed');
        rejectInput=false;rejectFast=false;panel.question.value='Recover the QA answer fixture';await panel.send();if(panel.conversation().history.at(-1).incomplete||!panel.messages.lastElementChild.querySelector('math'))throw new Error('Post-rejection fixture recovery failed');
        const originalWeb=host.webState().mode,opaqueQuestion='Opaque admission retry (offline QA launch '+seed.launch+')';await host.setWebMode('auto');await host.setChatGPTSpeed('fast');await host.setChatGPTReasoning('xhigh');rejectOpaque=true;panel.question.value=opaqueQuestion;const beforeOpaque=responseCalls;await panel.send();
        const opaqueCard=panel.messages.lastElementChild,compatible=opaqueCard.querySelector('.zma-retry-compatible'),explanation=opaqueCard.querySelector('.zma-error-details');if(!compatible||!explanation?.textContent.includes('Direct route rejected')||explanation.textContent.includes('synthetic-access')||responseCalls!==beforeOpaque+1)throw new Error('Opaque admission detail or compatible retry missing');
        copied='';const copyOpaque=host.copy;try{host.copy=value=>{copied=value;};opaqueCard.querySelector('.zma-error-diagnostic').click();for(let n=0;n<20&&!copied;n++)await new Promise(r=>setTimeout(r,25));}finally{host.copy=copyOpaque;}
        const opaqueDiagnostic=JSON.parse(copied);if(!opaqueDiagnostic.serverDetail.includes('Direct route rejected')||copied.includes('synthetic-access')||opaqueDiagnostic.request.serviceTier!=='priority'||!opaqueDiagnostic.request.webSearch)throw new Error('Opaque diagnostic did not preserve sanitized detail/config');
        compatible.click();for(let n=0;n<200;n++){await new Promise(r=>setTimeout(r,50));if(!panel.busy&&responseCalls===beforeOpaque+2)break;}
        if(responseCalls!==beforeOpaque+2||panel.conversation().history.at(-1).incomplete||requestBody.service_tier!=='default'||requestBody.tools||requestBody.reasoning||!JSON.stringify(requestBody).includes('当前打开的 PDF')||panel.conversation().history.filter(m=>m.role==='user'&&m.content===opaqueQuestion).length!==1)throw new Error('Explicit compatible retry lost context/settings or duplicated question');await host.setWebMode(originalWeb);
        await host.setChatGPTReasoning('xhigh');await host.setChatGPTSpeed('fast');
        if(!loopback)throw new Error('Actual native callback not used');
        return {opaqueDetailRetained:true,standardOfflineRetry:true,http400Diagnostics:true,reasoningRejectedRetry:true,validationInputRejection:true,draftPreservedOnRejection:true,safeDiagnosticCopy:true,liveMathBeforeCompletion,selectedReasoningEffort:true,selectedFastTier:true,confirmedFastTier:true,speedRejectedRetry:true,reasoningRestored:seed.launch>1,speedRestored:seed.launch>1,officialFlowMocked:true,realLoopbackHttpServer:true,stateRejected:true,webcryptoSignatureValidated:true,encryptedOSKeyStore:true,serializedRefresh:true,accountModelPicker:true,automaticPdfContext:true,markdownAndMath:true,restoredAfterRestart:restored,coldRestart:seed.launch>1,noExternalApiCalls:true};
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
