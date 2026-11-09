"""Isolated Gecko margin paste/drop, real embedded images and cold restoration."""
import argparse
from pathlib import Path
import subprocess
import sys
import zipfile

project = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--run-name', required=True)
args = parser.parse_args()
subprocess.run([sys.executable, str(project / 'scripts/library-smoke.py'), '--run-name', args.run_name], check=True)
work = project / 'evidence' / args.run_name
fixture = r'''
const fs=require('node:fs'),{createCanvas}=require('@napi-rs/canvas');
const canvas=createCanvas(360,140),ctx=canvas.getContext('2d');ctx.fillStyle='#f4f6ff';ctx.fillRect(0,0,360,140);
ctx.fillStyle='#243d7c';ctx.font='18px sans-serif';ctx.fillText('Margin image fixture',20,32);ctx.fillStyle='#111';ctx.font='16px serif';ctx.fillText('e(k) = y(k) - H(q,theta) u(k)',20,75);ctx.fillText('Local image note + PDF sibling copy',20,112);
fs.writeFileSync(process.argv[1],canvas.toBuffer('image/png'));
'''
subprocess.run(['node', '-e', fixture, str(work / 'margin-input.png')], check=True)
qa = work / 'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
    manifest = archive.read('manifest.json')
    bootstrap = archive.read('bootstrap.js').decode()

insertion = r'''
    await check('margin-images-native',async()=>{
      report.marginImageStage='open-pdf';
      const attachment=Zotero.Items.get(reader.itemID),target=await host.openPDF(attachment,{pageIndex:0}),scope=host.scope(target),state=await host.load(target),tick=()=>new Promise(resolve=>setTimeout(resolve,60));
      const panel=await host.panel(target);panel.close();
      if(!seed.marginImageAnnotationID){const item=await Zotero.Annotations.saveFromJSON(attachment,{key:Zotero.DataObjectUtilities.generateKey(),type:'highlight',text:'Image-only margin source',color:'#ffd400',pageLabel:'1',sortIndex:'00000|000400|00000',comment:'',position:{pageIndex:0,rects:[[70,400,250,422]]}});seed.marginImageAnnotationID=item.id;}
      const item=Zotero.Items.get(seed.marginImageAnnotationID),session=await addon.controller.ensureSession(target);
      report.marginImageStage='refresh-card';
      if(seed.launch===1)session.forcedKeys.add(item.key);
      await session.refresh(true);let runtime;
      for(let i=0;i<120;i++){runtime=session.cardRuntimes().find(r=>r.annotation.key===item.key);if(runtime?.imageInput&&runtime.card.isConnected)break;await tick();}
      if(!runtime?.imageInput)throw Error('Native margin image handler missing');
      const doc=runtime.card.ownerDocument,win=target._iframeWindow,originalClipboard=host.readClipboardAssets;
      host.readClipboardAssets=()=>[];
      const records=()=>state.images.filter(image=>image.annotationKey===item.key);
      const before=records().length;
      const waitImages=async count=>{for(let i=0;i<160;i++){runtime=session.cardRuntimes().find(r=>r.annotation.key===item.key)||runtime;await host.imageManager.flush();const images=[...runtime.card.querySelectorAll('.zma-inline-image img')];if(records().length===count&&images.length===count&&images.every(image=>image.naturalWidth===360))return images;await tick();}throw Error('Image records/render count mismatch '+JSON.stringify({records:records().length,rendered:runtime.card.querySelectorAll('.zma-inline-image').length,expected:count,status:runtime.card.textContent}));};
      const bytes=await IOUtils.read(PathUtils.join(work,'margin-input.png'));
      const createFile=()=>new win.File([bytes],'margin-input.png',{type:'image/png'});
      const transfer=files=>{const data=new win.DataTransfer();for(const file of files)data.items.add(file);return data;};
      try{
        report.marginImageStage='open-editor';
        if(seed.launch>1){if(before!==seed.marginImageCount)throw Error('Image records did not survive cold restart');await host.syncReferences(session,runtime);await waitImages(before);}
        session.openEditor(runtime);runtime.editor.focus();
        let button;
        for(let i=0;i<60;i++){button=runtime.card.querySelector('.zma-insert-image');if(button&&win.getComputedStyle(button.parentElement).display!=='none'&&button.getBoundingClientRect().width)break;await tick();}
        if(!button||win.getComputedStyle(button.parentElement).display==='none'||!button.getBoundingClientRect().width)throw Error('Image file-picker button remains hidden '+JSON.stringify({footer:win.getComputedStyle(button?.parentElement||runtime.card).display,card:runtime.card.getBoundingClientRect().toJSON(),button:button?.getBoundingClientRect().toJSON(),css:doc.getElementById('zma-styles')?.textContent.includes('.zmc-card .zmc-card-footer:has(.zma-insert-image)'),activeTab:target._window.Zotero_Tabs.selectedID,targetTab:target.tabID}));
        report.marginImageStage='read-comment';
        const rawBefore=session.readComment(runtime.editor);
        report.marginImageStage='create-file';
        const pastedFile=createFile();
        report.marginImageStage='create-transfer';
        const pastedData=transfer([pastedFile]);
        report.marginImageStage='create-paste';
        const paste=new win.ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:pastedData});
        report.marginPasteProbe={source:pastedData.files.length,event:paste.clipboardData?.files.length,items:paste.clipboardData?.items.length};
        // Gecko strips files from synthetic ClipboardEvents. Supply the exact
        // fixture through the production fallback without touching the clipboard.
        if(!paste.clipboardData?.files.length)host.readClipboardAssets=()=>[pastedFile];
        report.marginImageStage='dispatch-paste';runtime.editor.dispatchEvent(paste);
        if(!paste.defaultPrevented)throw Error('Native image paste was not claimed by margin handler');
        report.marginImageStage='wait-paste';await waitImages(before+1);host.readClipboardAssets=()=>[];
        if(session.readComment(runtime.editor)!==rawBefore)throw Error('Image paste changed text or LaTeX source');
        report.marginImageStage='dragover';
        const data=transfer([createFile(),createFile()]),over=new win.DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data});runtime.editor.dispatchEvent(over);
        if(!over.defaultPrevented||!runtime.card.classList.contains('zma-image-drop-target'))throw Error('Native file drag feedback missing');
        report.marginImageStage='drop';
        const drop=new win.DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data});runtime.editor.dispatchEvent(drop);
        if(!drop.defaultPrevented)throw Error('Native image drop was not consumed');await waitImages(before+3);
        report.marginImageStage='clipboard-fallback';
        host.readClipboardAssets=options=>{if(options?.maxBytes!==10*1024*1024)throw Error('Margin clipboard budget changed');return [{bytes,name:'clipboard-fixture.png'}];};
        const fallback=new win.ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:new win.DataTransfer()});runtime.editor.dispatchEvent(fallback);
        if(!fallback.defaultPrevented)throw Error('Gecko screenshot fallback did not consume paste');await waitImages(before+4);
        report.marginImageStage='text-paste';host.readClipboardAssets=()=>[];
        const textData=new win.DataTransfer();textData.setData('text/plain','\\[a=b \\\\ c=d\\]');const textPaste=new win.ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:textData});runtime.editor.dispatchEvent(textPaste);
        if(textPaste.defaultPrevented)throw Error('Plain formula paste was intercepted as an image');
        report.marginImageStage='readonly-paste';const count=records().length;runtime.annotation.readOnly=true;
        try{runtime.editor.dispatchEvent(new win.ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer([createFile()])}));await tick();if(records().length!==count)throw Error('Readonly margin accepted an image');}finally{runtime.annotation.readOnly=false;}
        report.marginImageStage='storage-check';
        const record=records()[0],note=Zotero.Items.getByLibraryAndKey(scope.libraryID,record.noteKey),image=Zotero.Items.getByLibraryAndKey(scope.libraryID,record.noteImageKey);
        if(!note?.isNote()||note.parentID!==attachment.parentID||!note.getNote().includes(record.noteImageKey)||!image?.isEmbeddedImageAttachment())throw Error('Real embedded image or native note missing');
        const path=PathUtils.join(PathUtils.parent(await attachment.getFilePathAsync()),'margin-comments-images',record.fileName),copy=await IOUtils.read(path);
        if(copy.length!==bytes.length||!copy.every((value,index)=>value===bytes[index]))throw Error('PDF sibling image bytes differ');
        report.marginImageStage='refresh-images';
        runtime.editor.blur();await tick();session.forcedKeys.delete(item.key);await session.refresh(true);await tick();runtime=session.cardRuntimes().find(r=>r.annotation.key===item.key)||runtime;await waitImages(count);
        if(String(item.annotationComment||'').trim()||!session.marginImageKeys?.has(item.key)||session.forcedKeys.has(item.key))throw Error('Image-only card visibility relies on comment text or temporary reveal');
        const sidecar=await host.pdfStatePath(scope.libraryID+'-'+scope.attachmentKey+'.json'),saved=JSON.parse(await IOUtils.readUTF8(sidecar));if(saved.images.filter(image=>image.annotationKey===item.key).length!==count)throw Error('Image records not persisted in PDF-side history');
        report.marginImageStage='finished';seed.marginImageCount=count;
        return {nativePaste:true,nativeDrop:true,clipboardFallback:true,onePasteOneImage:true,plainLatexPasteDelegated:true,readonlyRejected:true,visibleFileButton:true,nativeEmbeddedImage:true,pdfSiblingBytes:true,cardRefreshRestores:true,imageOnlyHighlightVisible:true,coldRestored:seed.launch>1,systemClipboard:'fixture callback; no clipboard writes',noExternalApiCalls:true,images:count};
      }finally{host.readClipboardAssets=originalClipboard;runtime.annotation.readOnly=false;runtime.editor.blur();await host.imageManager.flush();}
    });
'''
point = '    await host.store.flush();'
assert bootstrap.count(point) == 1
bootstrap = bootstrap.replace(point, insertion + '\n' + point)
subprocess.run(['node', '--check'], input=bootstrap, text=True, encoding='utf-8', check=True, capture_output=True)
with zipfile.ZipFile(qa, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('manifest.json', manifest)
    archive.writestr('bootstrap.js', bootstrap)
