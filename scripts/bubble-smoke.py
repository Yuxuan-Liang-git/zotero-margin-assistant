"""Native inline quote comments, combined send and per-conversation cold restart."""
import argparse,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);parser.add_argument('--pdf-fixture');args=parser.parse_args()
command=[sys.executable,str(project/'scripts/appearance-smoke.py'),'--run-name',args.run_name]
if args.pdf_fixture: command+=['--pdf-fixture',args.pdf_fixture]
subprocess.run(command,check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
# The migration fixture owns two conversations. The bubble fixture persists a
# third independent one; retain all original history/draft assertions, excluding
# only that explicitly recorded extra conversation from the fixture's count.
bootstrap=bootstrap.replace('panel.state.conversations.length!==2',"panel.state.conversations.filter(c=>c.id!==seed.quoteConversationID).length!==2")
bootstrap=bootstrap.replace("panel.state.conversations.find(c=>c.id!=='default')","panel.state.conversations.find(c=>c.id!=='default'&&c.id!==seed.quoteConversationID)")
bootstrap=bootstrap.replace('saved.conversations.length!==2',"saved.conversations.filter(c=>c.id!==seed.quoteConversationID).length!==2")
insertion=r'''
    await check('inline-quote-bubbles',async()=>{
      const panel=await host.panel(reader),originalID=panel.conversation().id,win=panel.doc.defaultView,originalClient=host.selectedClient,originalContext=host.documentContext;let restored=false,calls=0,sent;
      const outside=()=>{const session=host.addon.controller.sessions.get(reader);const doc=session?.adapter.document()||panel.doc;doc.body.dispatchEvent(new doc.defaultView.PointerEvent('pointerdown',{bubbles:true,cancelable:true}));};
      const comment=value=>{const input=panel.quotes.popover.querySelector('textarea');input.value=value;input.dispatchEvent(new win.Event('input',{bubbles:true}));};
      const pending=()=>{panel.quoteSelection('公式 \\(x^2+1\\)',{messageIndex:1,start:0,end:4});comment('first persisted comment');outside();panel.quoteSelection('有限激励条件',{messageIndex:1});comment('second persisted comment');outside();};
      try{
        if(seed.quoteConversationID){await panel.switchConversation(seed.quoteConversationID);restored=panel.conversation().draftQuotes?.length===2&&panel.conversation().draftQuotes[0].comment==='first persisted comment'&&panel.conversation().draftQuotes[1].comment==='second persisted comment';if(!restored)throw new Error('Independent bubble drafts not restored after restart');panel.quotes.clear();}
        else{await panel.newConversation();seed.quoteConversationID=panel.conversation().id;}
        const chat=panel.conversation();chat.history=[{role:'user',content:'Native quote QA',materials:[]},{role:'assistant',content:'公式 \\(x^2+1\\) 与有限激励条件',materials:[]}];chat.draft='';panel.question.value='';panel.renderMessages();panel.showChat();
        panel.quoteSelection('empty quote',{messageIndex:1});outside();if(!panel.quotes.popover.hidden||chat.draftQuotes?.length)throw new Error('Empty quote did not dismiss from PDF click');
        const math=panel.messages.querySelector('math'),range=panel.doc.createRange();range.selectNodeContents(math);win.getSelection().removeAllRanges();win.getSelection().addRange(range);math.dispatchEvent(new win.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:50,clientY:200}));const action=[...panel.node.querySelectorAll('.zma-clipboard-menu button')].find(b=>b.textContent==='引用并批注提问');if(!action)throw new Error('Native quote selection missing');action.click();comment('first native question');outside();
        if(!panel.quotes.popover.hidden||chat.draftQuotes.length!==1||!chat.draftQuotes[0].text.includes('\\('))throw new Error('Formula quote lost when collapsed');
        panel.quotes.tray.querySelector('button').click();await new Promise(r=>setTimeout(r,30));if(panel.quotes.popover.querySelector('textarea')?.value!=='first native question')throw new Error('Bubble cannot reopen');comment('edited first question');outside();
        panel.quoteSelection('有限激励条件',{messageIndex:1});comment('second native question');outside();if(chat.draftQuotes.length!==2||panel.question.value)throw new Error('Multiple quotes overwritten or inserted into composer');
        host.documentContext=async()=>({mode:'full-text',text:'Native offline context',pages:[1],totalPages:1});host.selectedClient=()=>({generate:async()=>{throw new Error('offline quote test');}});await panel.send();if(chat.draftQuotes.length!==2||!panel.status.textContent.includes('offline quote test'))throw new Error('Failed send lost bubble drafts');
        host.selectedClient=()=>({generate:async messages=>{calls++;sent=messages;return 'combined native answer';}});panel.question.value='Explain both';await panel.send();
        const question=chat.history.at(-2).content;if(calls!==1||!question.includes('edited first question')||!question.includes('second native question')||!JSON.stringify(sent).includes('edited first question')||chat.draftQuotes.length||panel.quotes.tray.children.length)throw new Error('Combined send missing quotes or did not clear after success');
        pending();await panel.persist();const scope=host.scope(reader),json=await IOUtils.readUTF8(await host.pdfStatePath(scope.libraryID+'-'+scope.attachmentKey+'.json')),disk=JSON.parse(json).conversations.find(c=>c.id===seed.quoteConversationID);if(disk.draftQuotes?.length!==2||disk.draftQuotes[0].text!=='公式 \\(x^2+1\\)')throw new Error('Bubble drafts or LaTeX not saved beside PDF');
        return {emptyDismissed:true,outsidePdfClick:true,multipleDrafts:true,reopenAndEdit:true,latexPreserved:true,failedSendRetained:true,combinedOnce:true,clearedAfterSuccess:true,independentDraftPersisted:true,restoredAfterRestart:restored,noExternalApiCalls:true};
      }finally{host.selectedClient=originalClient;host.documentContext=originalContext;await panel.switchConversation(originalID);await panel.persist();}
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
