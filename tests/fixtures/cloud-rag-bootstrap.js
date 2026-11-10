function install() {}
function uninstall() {}
function shutdown() {}
function startup() { setTimeout(() => run(), 250); }
async function run() {
  const work=__WORK__, data=__DATA__, seedFile=PathUtils.join(work,'seed.json');
  const report={phase:'starting',packageSha256:__HASH__,cases:[],process:Services.appinfo.processID};
  const pause=ms=>new Promise(r=>setTimeout(r,ms)), assert=(test,message)=>{if(!test)throw Error(message);};
  let seed={launch:0},host,manager,settingsWin,mode='normal',calls=[],held=[],perfDB,runtimes=[];
  const write=()=>IOUtils.writeUTF8(PathUtils.join(work,'report-'+(report.launch||'fatal')+'.json'),JSON.stringify(report,null,2));
  const check=async(name,fn)=>{report.current=name;await write();try{const result=await fn();report.cases.push({name,ok:true,result});}
    catch(e){report.cases.push({name,ok:false,error:String(e),stack:e.stack});await write();throw e;}await write();};
  const until=async(fn,label,ms=20000)=>{const deadline=Date.now()+ms;while(Date.now()<deadline){const result=await fn();if(result)return result;await pause(40);}throw Error('Timed out: '+label);};
  try {
    await Zotero.initializationPromise;await Zotero.uiReadyPromise;
    await Zotero.Libraries.get(Zotero.Libraries.userLibraryID).waitForDataLoad('item');
    assert(Zotero.DataDirectory.dir===data,'Data directory isolation failed');
    if(await IOUtils.exists(seedFile))seed=JSON.parse(await IOUtils.readUTF8(seedFile));
    seed.launch++;report.launch=seed.launch;report.zotero=Zotero.version;report.profile=Services.dirsvc.get('ProfD',Ci.nsIFile).path;await write();
    assert(report.profile===PathUtils.join(work,'profile'),'Profile isolation failed');
    const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    let installed=await AddonManager.getAddonByID('margin-comments@local.zotero');
    if(!installed){const pending=await AddonManager.getInstallForFile(Zotero.File.pathToFile(PathUtils.join(work,'assistant-under-test.xpi')));await pending.install();installed=await AddonManager.getAddonByID('margin-comments@local.zotero');}
    assert(installed?.version==='0.20.0'&&installed.isActive,'Final addon not active');
    host=await until(()=>Zotero.MarginComments?.assistant?.running&&Zotero.MarginComments.assistant,'assistant startup');
    manager=host.memory?.embedding;assert(manager,'Cloud RAG unavailable in native adapter');await manager.start();
    const api=host.settingsAPI().embedding, win=host.runtimeWindow(),libraryID=Zotero.Libraries.userLibraryID;
    const endpointA='https://fixture-a.invalid/v1/embeddings',endpointB='https://fixture-b.invalid/v1/embeddings';
    const keyA='fixture-only-cloud-key-a',keyB='fixture-only-cloud-key-b';
    const makeResponse=body=>new win.Response(JSON.stringify({model:body.model,data:body.input.map((text,index)=>({index,embedding:/阻尼|damping/i.test(text)?[0,1,0]:[1,0,0]})),usage:{prompt_tokens:body.input.length,total_tokens:body.input.length}}),{status:200,headers:{'Content-Type':'application/json'}});
    manager.client.fetch=async(endpoint,options)=>{
      assert([endpointA,endpointB].includes(endpoint),'Unexpected endpoint; external request prohibited');
      const body=JSON.parse(options.body);
      assert(options.method==='POST'&&body.model==='fixture-embedding','Wrong embedding contract');
      assert(body.input.length<=8,'Request batch exceeds cap');
      assert(body.input.every(s=>new win.TextEncoder().encode(s).length<=8000),'Request byte cap exceeded');
      calls.push({endpoint,inputs:body.input.slice(),kind:body.input[0]==='This is a connection test.'?'test':'material'});
      if(mode==='offline')throw Error('Controlled offline boundary');
      if(mode==='hold')return new Promise(resolve=>held.push(()=>resolve(makeResponse(body))));
      return makeResponse(body);
    };
    await check('install-cold-start-does-not-upload',async()=>{
      await pause(300);assert(!calls.length,'Startup uploaded');
      if(seed.launch===1)assert(!api.state().hasKey&&api.state().mode==='idle','Fresh installation was configured');
      else {
        assert(api.state().endpoint===endpointA&&api.state().hasKey&&api.state().tested,'A profile not restored');
        assert((await manager.profiles.credentials()).key===keyA,'System key cold recovery failed');
        assert(api.state().paused,'Paused build restarted');
        assert(api.state().readySegments===seed.readySegments&&api.state().namespace===seed.namespace,'Cached index not recovered');
      }
      return {noRequests:true,coldKeyRecovered:seed.launch===2,paused:api.state().paused,readySegments:api.state().readySegments};
    });
    if(!seed.ids){
      seed.ids={};
      for(const [name,title]of [['A','Current numerical observer'],['B','Passive mechanical network'],['C','Auxiliary thermal model']]){
        const parent=new Zotero.Item('journalArticle');parent.libraryID=libraryID;parent.setField('title',title);await parent.saveTx();
        const item=new Zotero.Item('attachment');item.libraryID=libraryID;item.parentID=parent.id;item.setField('title',name+' authored PDF');
        item.attachmentLinkMode=Zotero.Attachments.LINK_MODE_LINKED_FILE;item.attachmentContentType='application/pdf';item.attachmentPath=PathUtils.join(work,name+'.pdf');await item.saveTx();
        seed.ids[name]={parentID:parent.id,attachmentID:item.id,key:item.key,paperKey:parent.key};
      }
      await IOUtils.writeUTF8(seedFile,JSON.stringify(seed));
    }
    const itemB=Zotero.Items.get(seed.ids.B.attachmentID);
    const absentBHistory=async()=>!await IOUtils.exists(PathUtils.join(work,'margin-comments-assistant-'+libraryID+'-'+itemB.key+'.json'))
      &&!await IOUtils.exists(PathUtils.join(host.directory,libraryID+'-'+itemB.key+'.json'));
    const reader=await host.openPDF(Zotero.Items.get(seed.ids.A.attachmentID),{pageIndex:0});
    const panel=await host.panel(reader);panel.open();panel.showChat();
    const scope={...host.scope(reader),paperKey:seed.ids.A.paperKey};
    await check('native-settings-and-unsaved-fields',async()=>{
      settingsWin=Zotero.Utilities.Internal.openPreferences('margin-comments-preferences');
      const entry=await until(()=>{const e=settingsWin.Zotero_Preferences?.panes.get('margin-comments-preferences');return e?.loaded&&e;},'real preferences pane');
      const container=entry.container,find=name=>container.querySelector('#zma-embedding-'+name);
      for(const name of ['enabled','preset','endpoint','model','key','apply','test','clear-key','pilot','build','pause','clear-index','status','max-input','batch-size','rpm','threshold'])assert(find(name),'Missing setting '+name);
      assert(entry.container.hidden===false&&find('key').type==='password','Settings invisible/password field missing');
      const model=find('model'),before=model.value;model.value='unsaved-native-edit';model.dispatchEvent(new settingsWin.Event('input',{bubbles:true}));
      manager.publish();assert(model.value==='unsaved-native-edit'&&find('build').disabled,'Progress overwrote unsaved field/actions');
      model.value=before;model.dispatchEvent(new settingsWin.Event('input',{bubbles:true}));
      return {nativePreferences:true,modelAndPasswordVisible:true,unsavedEditPreserved:true,actionGuard:true};
    });
    const find=name=>settingsWin.Zotero_Preferences.panes.get('margin-comments-preferences').container.querySelector('#zma-embedding-'+name);
    await check('endpoint-isolation-and-encrypted-prefs',async()=>{
      const before=calls.length;
      if(seed.launch===1){
        find('endpoint').value=endpointA;find('endpoint').dispatchEvent(new settingsWin.Event('change'));
        find('model').value='fixture-embedding';find('key').value=keyA;find('apply').click();
        await until(()=>api.state().endpoint===endpointA&&api.state().hasKey,'UI save A');
        assert(calls.length===before,'Save uploaded library');
        await until(()=>!find('test').disabled,'UI save action settled');find('test').click();await until(()=>api.state().tested||api.state().status==='error','UI fixed-string test A');if(!api.state().tested){const probe=await new win.Response('realm').body.getReader().read();report.realmProbe={globalUint8:probe.value instanceof Uint8Array,windowUint8:probe.value instanceof win.Uint8Array,isView:ArrayBuffer.isView(probe.value),tag:Object.prototype.toString.call(probe.value),byteLength:probe.value.byteLength,decoder:typeof TextDecoder,windowDecoder:typeof win.TextDecoder};await write();try{await api.test();}catch(e){report.clientFailure={name:e.name,error:String(e),stack:e.stack};await write();throw e;}}
        assert(calls.slice(before).length===1&&calls.at(-1).kind==='test','Test uploaded material');
        await api.setEnabled(true);assert(calls.length===before+1,'Enable uploaded library');
      }
      const n=calls.length;
      find('endpoint').value=endpointB;find('endpoint').dispatchEvent(new settingsWin.Event('change'));
      assert(find('key').value===''&&!api.state(endpointB).hasKey,'B inherited A key');
      find('model').value='fixture-embedding';find('apply').click();
      await until(()=>api.state().endpoint===endpointB&&!find('test').disabled,'switch B');
      assert(!(await manager.profiles.credentials()).key,'Empty B key inherited');
      await api.apply({key:keyB});await api.test();
      assert((await manager.profiles.credentials()).key===keyB,'B key not saved');
      await api.clearKey();assert(!api.state().hasKey,'B clear failed');
      await api.apply({endpoint:endpointA,key:''});
      assert((await manager.profiles.credentials()).key===keyA&&api.state().tested,'A key/tested profile lost');
      const pref=Zotero.Prefs.get('margincomments.embeddingProfiles'),persisted=JSON.parse(pref);
      assert(!pref.includes(keyA)&&!pref.includes(keyB)&&persisted.profiles.find(p=>p.endpoint===endpointA).cipher.startsWith('oskv1:'),'Plaintext key persisted');
      assert(calls.slice(n).every(c=>c.kind==='test'),'Endpoint edits uploaded corpus');
      await host.save(reader,await host.load(reader));await pause(250);
      if(seed.launch===1)assert(calls.every(c=>c.kind==='test'),'PDF open/save uploaded before authorization');
      return {endpointBEmptyIsolated:true,endpointBCleared:true,endpointARecovered:true,encryptedOnly:true,fixedStringTestOnly:true};
    });
    await check('real-SDT-committed-corpus-no-B-history',async()=>{
      assert(await absentBHistory(),'B already has conversation');
      const pack=await Zotero.SDT.getPack(itemB.id,{isPriority:false});assert(pack.ok,'Native SDT failed');
      const r=await Zotero.SDT.getReader(itemB.id),catalog=await r.getCatalog();assert(catalog.pages.length===2,'B PDF page count');
      const blocks=await r.getPageBlocks(1);assert(JSON.stringify(blocks).includes('Damping injection'),'English target absent from page 2');
      if(seed.launch===1)for(const name of ['A','B','C']){
        const item=Zotero.Items.get(seed.ids[name].attachmentID),cache=Zotero.Fulltext.getItemCacheFile(item).path;
        assert(cache.startsWith(data+PathUtils.separator)||cache.startsWith(data+'\\'),'Optional cache outside isolated data');
        if(await IOUtils.exists(cache))await IOUtils.remove(cache);
      }
      if(seed.launch===1)await host.memory.rebuild(libraryID);else await host.memory.papers.ensure();
      const page=await host.memory.papers.index.sourcesPage({limit:128});
      assert(page.sources.some(v=>v.source.attachmentKey===itemB.key&&v.source.pageIndex===1&&v.source.text.includes('Damping injection')),'Committed corpus lacks page-aware B');
      assert(await absentBHistory(),'Indexing created B history');
      return {pageAwareSDT:true,bodyCommitted:true,BHasNoHistory:true,libraryID,parentKey:seed.ids.B.paperKey,attachmentKey:itemB.key};
    });
    if(seed.launch===1)await check('explicit-pilot-build-completes',async()=>{
      await pause(2200);await host.memory.papers.run();await pause(100);await api.pilot();await manager.work;
      assert(api.state().completed&&api.state().readySegments>0,'Pilot incomplete: '+JSON.stringify(api.state()));
      assert(calls.some(c=>c.kind==='material'&&c.inputs.some(t=>t.includes('Damping injection'))),'B not embedded');
      assert(await absentBHistory(),'Embedding created B history');
      return {mode:api.state().mode,completed:true,readySources:api.state().readySources,readySegments:api.state().readySegments,BSourceEmbedded:true,BHistoryAbsent:true};
    });
    // Keep indexing paused, while actual foreground retrieval remains available.
    if(!api.state().paused)await api.pause();
    const requests=[];
    host.selectedClient=()=>({generate:async(messages,options)=>{requests.push(messages);options.onDelta?.('受控来源验证[阅读1]。');return '受控来源验证[阅读1]。';}});
    await check('cross-language-B-enters-actual-A-request-and-jumps',async()=>{
      const question='阻尼注入如何保障无源性';
      panel.question.value=question;await panel.send();
      const messages=requests.at(-1),answer=panel.conversation().history.at(-1);
      assert(messages&&JSON.stringify(messages).includes('CurrentDocumentAnchor'),'Current PDF body missing');
      assert(JSON.stringify(messages).includes('Damping injection dissipates stored energy and ensures passivity.'),'B target omitted from actual A request');
      const source=answer.memorySources?.find(s=>s.kind==='pdf'&&s.attachmentKey===itemB.key&&s.pageIndex===1&&s.text.includes('Damping injection'));
      assert(source&&!answer.incomplete,'B provenance/page lost');
      assert(!answer.memorySources.some(s=>s.attachmentKey===scope.attachmentKey&&(s.kind==='pdf'||s.kind==='dialogue'&&s.conversationId===panel.conversation().id)),'Current source not excluded');
      await IOUtils.writeUTF8(PathUtils.join(work,'request-'+seed.launch+'.json'),JSON.stringify({question,messages,sources:answer.memorySources},null,2));
      await host.memory.openSource(source);
      const target=await until(()=>Zotero.Reader._readers.find(r=>Number(r.itemID)===itemB.id),'B source reader');
      await until(()=>host.unwrap(target._internalReader)?._state.primaryViewState?.pageIndex===1,'B page jump');
      assert(await absentBHistory(),'Source navigation created B history');
      return {question,sharedLiteralTerms:false,BSourceInActualRequest:true,currentPDFPreserved:true,sourcePageIndex:source.pageIndex,nativeReaderPageIndex:1,BHistoryAbsent:true,queryWhilePaused:api.state().paused,requestFile:'request-'+seed.launch+'.json'};
    });
    await check('query-vector-cache-and-master-off',async()=>{
      const question='阻尼注入缓存核对',query=question+'\nCurrent numerical observer\npassive damping theme';
      const before=calls.length,first=await manager.retrieve(scope,query,{question}),second=await manager.retrieve(scope,query,{question});
      assert(first.some(s=>s.attachmentKey===itemB.key)&&second.some(s=>s.attachmentKey===itemB.key),'Cached vector lost B provenance');
      assert(calls.length===before+1,'Identical query did not reuse vector');
      assert(manager.queryVectors.size<=32,'Query cache exceeds entry bound');
      await host.memory.settingsAPI().set(false);
      const disabledCalls=calls.length,disabled=await host.memory.retrieve(scope,query,{question});
      assert(!disabled.length&&calls.length===disabledCalls,'Master off queried/returned memory');
      assert(api.state().enabled&&api.state().hasKey,'Master off erased Embedding profile');
      assert(!(await manager.retrieve(scope,query,{question})).length&&calls.length===disabledCalls,'Native Manager ignored master');
      await host.memory.settingsAPI().set(true);
      await manager.retrieve(scope,query,{question});assert(calls.length===disabledCalls+1,'Master toggle did not invalidate query vector');
      return {identicalRequests:1,entryLimit:32,ttlMs:60000,masterOffNoRequestsOrSources:true,embeddingProfileRetained:true,masterReenableFreshVector:true};
    });
    await check('offline-timeout-cancellation-local-fallback',async()=>{
      mode='offline';panel.question.value='LexicalFallbackNeedle';await panel.send();
      let text=JSON.stringify(requests.at(-1));
      assert(text.includes('CurrentDocumentAnchor')&&text.includes('LexicalFallbackNeedle describes an auxiliary thermal model.'),'Offline current PDF/local fallback missing');
      assert(!panel.conversation().history.at(-1).incomplete,'Offline broke normal chat');
      mode='hold';const began=Date.now();panel.question.value='LexicalFallbackNeedle';await panel.send();
      const elapsed=Date.now()-began;text=JSON.stringify(requests.at(-1));
      assert(elapsed>=7800&&elapsed<14000&&text.includes('CurrentDocumentAnchor')&&text.includes('LexicalFallbackNeedle describes'),'8s fallback failed: '+elapsed);
      const heldCount=held.length;held.splice(0).forEach(release=>release());await pause(50);
      const control=host.newAbortController(),pending=manager.retrieve(scope,'阻尼',{question:'阻尼',signal:control.signal});
      await until(()=>held.length,'cancel pending query');control.abort();assert((await pending).length===0,'Cancelled query returned dense sources');
      held.splice(0).forEach(release=>release());mode='normal';
      return {offlinePDFAndLexicalPreserved:true,timeoutBudgetMs:8000,observedPanelElapsedMs:elapsed,lateFetchesDiscarded:heldCount,explicitCancellation:true,remainingQueries:manager.queryControllers.size};
    });
    await check('config-change-discards-late-test',async()=>{
      const ready=api.state().readySegments;mode='hold';const pending=api.test().then(()=>false,()=>true);
      await until(()=>held.length,'held configuration test');
      await api.apply({endpoint:endpointB});assert(await pending,'Changed test did not cancel');
      held.splice(0).forEach(release=>release());await pause(100);
      assert(api.state().endpoint===endpointB&&!api.state().hasKey&&!api.state().tested,'Late test marked new endpoint');
      await api.apply({endpoint:endpointA});assert(api.state().readySegments===ready&&api.state().tested,'Config change lost A cache');
      mode='normal';
      return {cancelledTest:true,lateCallbackIgnored:true,validCacheRetained:true,readySegments:ready};
    });
    if(seed.launch===1)await check('native-full-scale-worker-SQLite-performance',async()=>{
      perfDB=new Zotero.DBConnection(__SYNTHETIC__);perfDB.skipBackup=true;
      const total=Number((await perfDB.queryAsync('SELECT COUNT(*) AS total FROM vectors'))[0].total);assert(total===69240,'Synthetic dataset count');
      const results=[],resident=()=>{try{return Number(Cc['@mozilla.org/memory-reporter-manager;1'].getService(Ci.nsIMemoryReporterManager).resident);}catch{return null;}};
      const measure=async(runtime,label)=>{
        let last=Date.now(),maxGap=0,ticks=0,peak=resident(),pages=0,maxPage=0;const startResident=peak,workerExistedAtStart=!!runtime.worker,cacheAtStart={...runtime.stats};
        const tick=setInterval(()=>{const n=Date.now();maxGap=Math.max(maxGap,n-last);last=n;ticks++;peak=Math.max(peak||0,resident()||0);},20);
        const control=host.newAbortController(),deadline=setTimeout(()=>control.abort(),8000),start=Date.now();let hits,timeout=false,error='';
        try{
          hits=await runtime.search({namespace:'synthetic:1024',revision:1,dimensions:1024,vector:[1,...Array(1023).fill(0)],limit:96,signal:control.signal,
            rows:async(after,limit)=>{
              const found=await perfDB.queryAsync('SELECT id,encoded FROM vectors WHERE id>? ORDER BY id LIMIT ?',[after,limit]);pages++;
              maxPage=Math.max(maxPage,found.reduce((s,r)=>s+r.encoded.length*2+256,0));
              return found.map(r=>({id:Number(r.id),encoded:r.encoded,paperKey:'P'+String(Math.ceil(r.id/90)).padStart(7,'0'),attachmentKey:'A'+String(Math.ceil(r.id/90)).padStart(7,'0'),kind:'pdf',conversationId:'',compact:'',norm:1,dimensions:1024}));
            }});
          assert(hits[0]?.id===69240&&runtime.stats.scannedRows===69240,'Tail winner/full scan lost');
          assert(runtime.stats.cacheBytes<=runtime.maxCacheBytes&&runtime.stats.cachedRows<total,'Cache bound/overflow not tested');
        }catch(e){if(!control.signal.aborted)throw e;timeout=true;error=String(e);}
        finally{clearInterval(tick);clearTimeout(deadline);}
        const result={label,pageSize:runtime.batchSize,workerExistedAtStart,cacheAtStart,candidateLimit:96,queryBudgetMs:8000,elapsedMs:Date.now()-start,timeout,error,winner:hits?.[0]||null,pages,maxMainPageEstimatedBytes:maxPage,maxHeartbeatGapMs:maxGap,heartbeatTicks:ticks,startResidentBytes:startResident,peakObservedResidentBytes:peak,cacheBudgetBytes:runtime.maxCacheBytes,...runtime.stats};
        results.push(result);report.nativePerformance={datasetRows:total,dimensions:1024,sourceDatabase:__SYNTHETIC__,pageSize:runtime.batchSize,results,limits:'Native parent process sampled resident memory includes Zotero/SQLite/reader/Worker and engine overhead; not isolated vector-only memory. Main page estimate uses UTF-16 strings plus metadata. No cloud latency.'};await write();
      };
      const runtime=new manager.runtime.constructor(manager.runtime.createWorker,{...(__PAGESIZE__?{batchSize:__PAGESIZE__}:{}),maxCacheBytes:128*1024*1024});runtimes.push(runtime);
      await measure(runtime,'cold-128MiB');await measure(runtime,'warm-128MiB');runtime.destroy();
      const tiny=new manager.runtime.constructor(manager.runtime.createWorker,{...(__PAGESIZE__?{batchSize:__PAGESIZE__}:{}),maxCacheBytes:32768});runtimes.push(tiny);
      await measure(tiny,'overflow-32KiB');tiny.destroy();await perfDB.closeDatabase(true);perfDB=null;
      assert(results.every(r=>!r.timeout),'Native 8s budget exceeded; preserve evidence and tune only with proof');
      return {datasetRows:total,dimensions:1024,allScanned:true,tailWinner:69240,results};
    });
    await check('paused-incomplete-restart-and-stop-cleanup',async()=>{
      // Explicit full authorization remains paused before any new material request.
      manager.suspend(true);await api.build();await api.pause();await manager.work;
      assert(api.state().mode==='full'&&api.state().paused&&!api.state().completed,'Incomplete full task not paused');
      seed.readySegments=api.state().readySegments;seed.namespace=api.state().namespace;
      await host.store.flush();await Zotero.Session.save();await IOUtils.writeUTF8(seedFile,JSON.stringify(seed));
      await host.stop();
      assert(manager.stopped&&manager.runtime.closed&&!manager.runtime.worker&&!manager.runtime.pending.size&&!manager.queryControllers.size&&!manager.buildController&&!manager.testController,'Stop left live handles');
      return {mode:'full',paused:true,completed:false,readySegments:seed.readySegments,workerStopped:true,pendingRPC:manager.runtime.pending.size,queryControllers:manager.queryControllers.size,stopped:true};
    });
    report.phase='done';report.current='done';report.noRealCloudOrInferenceCalls=true;report.totalEmbeddingRequests=calls.length;
    report.embeddingRequestKinds={test:calls.filter(c=>c.kind==='test').length,materialOrQuery:calls.filter(c=>c.kind!=='test').length};
  }catch(e){if(manager)report.failureState=manager.state();report.fixtureCalls=calls.map(c=>({endpoint:c.endpoint,kind:c.kind,inputCount:c.inputs.length}));report.phase='failed';report.fatal={error:String(e),stack:e.stack};}
  finally{
    held.splice(0).forEach(release=>release());runtimes.forEach(r=>r.destroy());
    try{await perfDB?.closeDatabase(true);}catch{}
    try{if(host?.running)await host.stop();}catch(e){report.cleanupError=String(e);}
    try{settingsWin?.close();}catch{}
    await write();Services.startup.quit(Services.startup.eForceQuit);
  }
}
