"""Isolated native web-search metadata, inline sources, images and explicit retry."""
import argparse,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);parser.add_argument('--pdf-fixture');args=parser.parse_args()
command=[sys.executable,str(project/'scripts/pdf-bubble-smoke.py'),'--run-name',args.run_name]
if args.pdf_fixture:command+=['--pdf-fixture',args.pdf_fixture]
subprocess.run(command,check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
bootstrap=bootstrap.replace('c.id!==seed.pdfQuoteConversationID','c.id!==seed.pdfQuoteConversationID&&c.id!==seed.webConversationID')
insertion=r'''
    await check('automatic-web-sources-and-images',async()=>{
      const panel=await host.panel(reader),originalID=panel.conversation().id,client=host.chatgpt,originalFetch=client.fetch,originalClient=host.selectedClient,originalContext=host.documentContext,originalOpen=host.openExternal,win=panel.doc.defaultView;let restored=false,requests=0,opened;
      // Keep external images from making network requests in this offline QA.
      const policy=panel.doc.createElementNS('http://www.w3.org/1999/xhtml','meta');policy.setAttribute('http-equiv','Content-Security-Policy');policy.setAttribute('content',"img-src data: blob: chrome: resource:");panel.doc.head.append(policy);
      try{
        if(seed.launch>1){if(host.webState().mode!=='off'||host.webState().images!==false)throw new Error('Web preferences not restored');await panel.switchConversation(seed.webConversationID);restored=panel.conversation().history.some(m=>m.web?.images?.length&&m.web?.citations?.length);if(!restored)throw new Error('Search sources/images not restored after restart');}else{await panel.newConversation();seed.webConversationID=panel.conversation().id;}
        await host.setWebMode('auto');await host.setWebImages(true);panel.showChat();host.documentContext=async()=>({mode:'full-text',text:'Native PDF context',pages:[1],totalPages:1});host.selectedClient=()=>client;host.openExternal=url=>{opened=url;};
        const event=v=>'data: '+JSON.stringify(v)+'\n\n',citation={type:'url_citation',url:'https://paper.example/source',title:'Primary paper',start_index:0,end_index:7},image={type:'image_result',image_url:'https://images.example/figure.png',source_website_url:'https://paper.example/source',caption:'Sourced illustration'};
        client.fetch=async(url,options)=>{if(!url.endsWith('/responses'))throw new Error('Unexpected offline endpoint');requests++;const body=JSON.parse(options.body);if(body.tools?.[0]?.type!=='web_search'||!body.tools[0].search_content_types.includes('image')||!body.include.includes('web_search_call.results'))throw new Error('Web/image tools not requested');return new win.Response(event({type:'response.web_search_call.searching'})+event({type:'response.output_text.delta',item_id:'web-msg',content_index:0,delta:'网络补充解释。'})+event({type:'response.output_text.annotation.added',item_id:'web-msg',content_index:0,annotation:citation})+event({type:'response.output_item.done',item:{type:'web_search_call',status:'completed',results:[image]}})+event({type:'response.completed',response:{service_tier:'default'}}));};
        panel.question.value='Find references and illustrate the PDF';await panel.send();const answer=panel.conversation().history.at(-1),card=panel.messages.lastElementChild;if(answer.incomplete||requests!==1||answer.web?.citations?.length!==1||answer.web?.images?.length!==1)throw new Error('Web metadata missing: '+panel.status.textContent);
        if(!card.querySelector('.zma-answer a[href="https://paper.example/source"]')||card.querySelectorAll('.zma-web-images figure').length!==1)throw new Error('Native inline source or sourced gallery missing');card.querySelector('.zma-answer a').click();if(opened!=='https://paper.example/source')throw new Error('Source did not open through host navigation');
        await panel.persist();const scope=host.scope(reader),saved=await IOUtils.readUTF8(await host.pdfStatePath(scope.libraryID+'-'+scope.attachmentKey+'.json'));if(!saved.includes('Sourced illustration')||!saved.includes('Primary paper'))throw new Error('Search provenance not saved beside PDF');panel.close();panel.showChat();panel.renderMessages();if(!panel.messages.querySelector('.zma-web-result'))throw new Error('Web result lost after reopen');
        let attempts=0;client.fetch=async(_url,options)=>{attempts++;const body=JSON.parse(options.body);if(attempts===1)return win.Response.json({error:{code:'unsupported_parameter',param:'tools',message:'web_search not supported'}},{status:400});if(body.tools)throw new Error('Explicit offline retry still contains tools');return new win.Response(event({type:'response.output_text.delta',delta:'Offline PDF explanation'})+event({type:'response.completed',response:{service_tier:'default'}}));};panel.question.value='Repeat with current PDF';const before=panel.conversation().history.length;await panel.send();if(attempts!==1||!panel.messages.lastElementChild.querySelector('.zma-retry-web'))throw new Error('Search rejection automatically retried or missing recovery');panel.messages.lastElementChild.querySelector('.zma-retry-web').click();for(let i=0;i<150&&(attempts<2||panel.busy);i++)await new Promise(r=>setTimeout(r,30));if(attempts!==2||panel.busy||panel.conversation().history.length!==before+2||panel.conversation().history.at(-1).incomplete||host.webState().mode!=='off')throw new Error('Explicit search-off retry duplicated question or failed');await host.setWebImages(false);
        return {automaticWebRequest:true,inlineCitations:true,sourceNavigation:true,sourcedImageMetadata:true,offlineImageNetworkBlocked:true,localHistoryProvenance:true,reopenRestores:true,explicitRetryOnly:true,noDuplicateQuestion:true,preferencesAndHistoryColdRestored:restored,noExternalApiCalls:true};
      }finally{client.fetch=originalFetch;host.selectedClient=originalClient;host.documentContext=originalContext;host.openExternal=originalOpen;policy.remove();await panel.switchConversation(originalID);await panel.persist();}
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
