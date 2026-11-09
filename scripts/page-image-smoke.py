"""Real Gecko page-image input, movement, native export, Worker and cold restoration."""
import argparse
from pathlib import Path
import subprocess
import sys
import zipfile

project = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--run-name', required=True)
args = parser.parse_args()
subprocess.run([sys.executable, str(project / 'scripts/margin-image-smoke.py'), '--run-name', args.run_name], check=True)
work = project / 'evidence' / args.run_name
qa = work / 'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
    manifest = archive.read('manifest.json')
    bootstrap = archive.read('bootstrap.js').decode()
assert bootstrap.count('saved.version!==2') == 1
bootstrap = bootstrap.replace('saved.version!==2', '![2,3].includes(saved.version)')
insertion = r'''
    await check('page-images-native',async()=>{
      report.pageImageStage='open-reader';
      const attachment=Zotero.Items.get(reader.itemID),target=await host.openPDF(attachment,{pageIndex:0}),session=await addon.controller.ensureSession(target);
      target._window.Zotero_Tabs.select(target.tabID,true);await target.focus();
      const panel=await host.panel(target);panel.close();panel.notion?.hide?.();
      const layer=host.ensurePageImages(session);await layer.refresh();
      const state=await host.load(target),scope=host.scope(target),win=target._iframeWindow,doc=session.adapter.document();
      const pause=()=>new Promise(resolve=>setTimeout(resolve,60));
      const wait=async predicate=>{for(let i=0;i<250;i++){if(predicate())return;await pause();}throw Error('Page image wait expired at '+report.pageImageStage+' '+layer.status.textContent);};
      const hash=file=>Zotero.Utilities.Internal.md5Async(file);
      const sourcePath=await attachment.getFilePathAsync(),sourceHash=await hash(sourcePath),sidecar=await host.pdfStatePath(scope.libraryID+'-'+scope.attachmentKey+'.json'),previous=await IOUtils.readUTF8(sidecar);
      const originalClipboard=host.readClipboardAssets,originalChoose=host.chooseConversationFile,originalWorker=host.createImageExportWorker;
      try{
        if(seed.launch>1){const restored=state.pageImages?.find(image=>image.id===seed.pageImageID);if(!restored?.locked||JSON.stringify(restored.matrix)!==JSON.stringify(seed.pageImageMatrix))throw Error('Page image did not restore locked geometry');}
        report.pageImageStage='paste-page';
        const bytes=await IOUtils.read(PathUtils.join(work,'margin-input.png'));host.readClipboardAssets=()=>[{bytes,name:'page-fixture.png'}];
        const page=session.adapter.page(0);page.element.tabIndex=0;page.element.focus();
        const before=state.pageImages?.length||0,paste=new win.ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:new win.DataTransfer()});page.element.dispatchEvent(paste);
        if(!paste.defaultPrevented)throw Error('PDF paste was not claimed');
        await wait(()=>state.pageImages?.length===before+1);await host.imageManager.flush();layer.paint();
        const record=state.pageImages.at(-1);await wait(()=>layer.entries.get(record.id)?.image.naturalWidth===360&&layer.entries.get(record.id)?.node.getBoundingClientRect().width>0);
        const asset=state.images.find(image=>image.id===record.imageID),note=Zotero.Items.getByLibraryAndKey(scope.libraryID,asset.noteKey),embedded=Zotero.Items.getByLibraryAndKey(scope.libraryID,asset.noteImageKey);
        if(asset.annotationKey||asset.sourcePageIndex!==0||!note?.isNote()||!note.getNote().includes(asset.noteImageKey)||!embedded?.isEmbeddedImageAttachment())throw Error('Page-only native image note missing');
        const copy=await IOUtils.read(PathUtils.join(PathUtils.parent(sourcePath),'margin-comments-images',asset.fileName));
        if(copy.length!==bytes.length||!copy.every((value,index)=>value===bytes[index]))throw Error('Page-only sibling image bytes differ');
        if(seed.launch===1&&(await IOUtils.readUTF8(sidecar+'.v2.bak'))!==previous)throw Error('Native v2 backup differs');
        report.pageImageStage='pointer-move';
        let current=state.pageImages.find(image=>image.id===record.id);
        const entry=layer.entries.get(record.id),bounds=entry.node.getBoundingClientRect();
        report.pagePointer={bounds:bounds.toJSON(),viewport:[page.viewport.width,page.viewport.height],matrix:current.matrix};
        const pointer=(type,x,y,button=0)=>new win.PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,pointerType:'mouse',button,buttons:type==='pointerup'?0:1,clientX:x,clientY:y});
        entry.node.dispatchEvent(pointer('pointerdown',bounds.left+bounds.width/2,bounds.top+bounds.height/2));
        report.pagePointer.started=!!layer.drag;report.pagePointer.selected=layer.selected;report.pagePointer.sameDocument=entry.node.ownerDocument===doc;report.pagePointer.activeLayer=host.pageImageLayers.get(target)===layer;
        doc.dispatchEvent(pointer('pointermove',bounds.left+bounds.width/2+24,bounds.top+bounds.height/2+16));
        doc.dispatchEvent(pointer('pointerup',bounds.left+bounds.width/2+24,bounds.top+bounds.height/2+16));
        report.pagePointer.preview=entry.preview;await write();
        await wait(()=>JSON.stringify(state.pageImages.find(image=>image.id===record.id).matrix)!==JSON.stringify(current.matrix));await host.imageManager.flush();
        report.pageImageStage='pointer-resize';
        current=state.pageImages.find(image=>image.id===record.id);const oldWidth=Math.hypot(current.matrix[0],current.matrix[1]);
        layer.selected=record.id;layer.paint();const handle=entry.handle.getBoundingClientRect();
        entry.handle.dispatchEvent(pointer('pointerdown',handle.left+5,handle.top+5));doc.dispatchEvent(pointer('pointermove',handle.left+35,handle.top+15));doc.dispatchEvent(pointer('pointerup',handle.left+35,handle.top+15));
        await wait(()=>Math.hypot(state.pageImages.find(image=>image.id===record.id).matrix[0],state.pageImages.find(image=>image.id===record.id).matrix[1])>oldWidth);await host.imageManager.flush();
        report.pageImageStage='lock-placement';
        layer.selected=record.id;layer.paint();entry.lock.click();await wait(()=>state.pageImages.find(image=>image.id===record.id).locked);await host.imageManager.flush();
        report.pageImageStage='native-image-viewer';entry.node.dispatchEvent(new win.MouseEvent('dblclick',{bubbles:true,cancelable:true}));
        await wait(()=>host.imageViewers.get(target)?.image.naturalWidth===360);
        const viewer=host.imageViewers.get(target),originalButton=Array.from(viewer.node.querySelectorAll('button')).find(button=>button.textContent==='100% 原尺寸');originalButton.click();
        if(Math.round(viewer.image.getBoundingClientRect().width)!==360)throw Error('Native original image size is wrong');viewer.closeButton.click();
        report.pageImageStage='native-gif';
        const gif=Uint8Array.from(win.atob('R0lGODlhAgABAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAAwAAACwAAAAAAgABAAAIBQABAAgIACH5BAEDAAEALAAAAAACAAEAgQAA/wAAAAAAAAAAAAgFAAEACAgAOw=='),character=>character.charCodeAt(0));
        const inserted=await layer.insert([{bytes:gif}],{pageIndex:0,x:40,y:100});if(inserted.inserted!==1)throw Error('Native GIF input failed '+inserted.errors.join(' '));
        report.pageImageStage='worker-export';
        const output=PathUtils.join(work,'page-images-export-'+seed.launch+'.pdf');host.chooseConversationFile=async(_window,options)=>{if(options.extension!=='pdf')throw Error('Wrong export filter');return output;};
        host.createImageExportWorker=()=>{const worker=originalWorker();worker.addEventListener('error',event=>{report.pageWorkerError={message:event.message,filename:event.filename};});return worker;};
        await host.exportPageImages(target);
        if(!await IOUtils.exists(output)||await hash(sourcePath)!==sourceHash)throw Error('Export absent or source PDF changed');
        if((await IOUtils.getChildren(work)).some(path=>path.startsWith(output+'.zma-')))throw Error('Owned export intermediate or temporary file leaked');
        report.pageImageStage='reopen-export';
        const exported=new Zotero.Item('attachment');exported.libraryID=attachment.libraryID;exported.parentID=attachment.parentID;exported.setField('title','Exported page images QA '+seed.launch);exported.attachmentLinkMode=Zotero.Attachments.LINK_MODE_LINKED_FILE;exported.attachmentPath=output;exported.attachmentContentType='application/pdf';await exported.saveTx();
        const exportedReader=await host.openPDF(exported,{pageIndex:0}),full=await host.currentPage(exportedReader,0),capture=await host.capture(exportedReader,full);
        const image=await new Promise((resolve,reject)=>{const node=new win.Image();node.onload=()=>resolve(node);node.onerror=reject;node.src=capture.dataURL;});
        const canvas=win.document.createElementNS('http://www.w3.org/1999/xhtml','canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);
        const final=state.pageImages.find(image=>image.id===record.id),exportSession=await addon.controller.ensureSession(exportedReader);
        const viewport=exportSession.adapter.page(0).viewport,sx=canvas.width/viewport.width,sy=canvas.height/viewport.height;
        report.pageExportGeometry={capture:[capture.width,capture.height],canvas:[canvas.width,canvas.height],viewport:[viewport.width,viewport.height],scale:[sx,sy]};await write();
        const encoded=canvas.toDataURL('image/png').split(',')[1],raw=win.atob(encoded);await IOUtils.write(PathUtils.join(work,'export-preview-'+seed.launch+'.png'),Uint8Array.from(raw,character=>character.charCodeAt(0)));
        const m=final.matrix,points=[[.9,.07],[.95,.9],[.6,.05]];let matched=false;
        for(const point of points){const p=viewport.convertToViewportPoint(m[4]+m[0]*point[0]+m[2]*point[1],m[5]+m[1]*point[0]+m[3]*point[1]);if(!Number.isFinite(p[0]*sx)||!Number.isFinite(p[1]*sy))throw Error('Export sample geometry is invalid '+JSON.stringify(report.pageExportGeometry));const pixel=context.getImageData(p[0]*sx,p[1]*sy,1,1).data;if(Math.abs(pixel[0]-244)<4&&Math.abs(pixel[1]-246)<4&&Math.abs(pixel[2]-255)<4)matched=true;}
        if(!matched)throw Error('Exported image pixels missing at saved position');
        await host.openPDF(attachment,{pageIndex:0});await layer.refresh();
        seed.pageImageID=record.id;seed.pageImageMatrix=final.matrix.slice();
        report.pageImageStage='finished';
        return {normalPaste:true,nativePointerMove:true,nativePointerResize:true,locked:true,originalPixelViewer:true,version3Saved:JSON.parse(await IOUtils.readUTF8(sidecar)).version===3,nativeNoteAndCopy:true,nativeGifNormalization:true,realWorkerExport:true,exportReopened:true,exportPixelsAtSavedPosition:true,sourceHashPreserved:true,snapshotAndTemporaryCleanup:true,coldRestored:seed.launch>1,noExternalApiCalls:true};
      }finally{host.readClipboardAssets=originalClipboard;host.chooseConversationFile=originalChoose;host.createImageExportWorker=originalWorker;await host.imageManager.flush();}
    });
'''
point = '    await host.store.flush();'
assert bootstrap.count(point) == 1
bootstrap = bootstrap.replace(point, insertion + '\n' + point)
subprocess.run(['node', '--check'], input=bootstrap, text=True, encoding='utf-8', capture_output=True, check=True)
with zipfile.ZipFile(qa, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json', manifest)
    archive.writestr('bootstrap.js', bootstrap)
