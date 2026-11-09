"""Isolated native mixed-PDF page vision acceptance, including cold restart."""
import argparse,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);args=parser.parse_args()
subprocess.run([sys.executable,str(project/'scripts/scroll-smoke.py'),'--run-name',args.run_name],check=True)
subprocess.run(['node',str(project/'scripts/vision-fixture.cjs'),str(project/'evidence'/args.run_name/'qa.pdf')],check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
insertion=r'''
    await check('mixed-pdf-page-vision',async()=>{
      const panel=await host.panel(reader),chat=panel.conversation(),draft=chat.draft,files=chat.draftAttachments,originalClient=host.selectedClient,win=reader._iframeWindow;let sent;
      try{
        const context=await host.documentContext(reader,'Explain formula (6.30)');
        if(!context.text.includes('prediction error')||context.text.includes('y(t) - H'))throw new Error('Fixture text must omit the raster equation');
        if(context.materials.length!==2||context.materials.some(m=>!m.dataURL.startsWith('data:image/png;base64,')||!m.source.automaticPage))throw new Error('Native mixed PDF images missing');
        const png=Uint8Array.from(win.atob(context.materials[0].dataURL.split(',')[1]),c=>c.charCodeAt(0));await IOUtils.write(PathUtils.join(work,'mixed-page-'+seed.launch+'.png'),png);
        chat.draftAttachments=[];host.selectedClient=()=>({summarize:async()=> '旧对话摘要',generate:async messages=>{sent=messages;return '合成回答：请核对页面图片公式。';}});
        panel.question.value='Explain formula (6.30)';await panel.send();
        if(chat.history.at(-1).incomplete||!sent.at(-1).content.some(p=>p.type==='file')&&sent.at(-1).content.filter(p=>p.type==='image_url').length!==2)throw new Error('Automatic PDF/images not submitted: '+panel.status.textContent);
        if(chat.history.at(-2).pdfContext?.mode!=='full-pdf'&&chat.history.at(-2).materials.filter(s=>s.automaticPage).length!==2)throw new Error('PDF coverage/source markers not persisted');
        const totalImages=sent.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='image_url').length;
        // Earlier pasted/manual materials are retained; automatic page snapshots belong to this turn only.
        if(!panel.contextInfo.textContent.includes('已附带完整 PDF')&&!panel.contextInfo.textContent.includes('页面图片：PDF 第 1、2 页'))throw new Error('Actual image coverage missing from UI');
        return {textLayerOmitsRasterFormula:true,pageImageCount:2,requestImageCount:totalImages,textAndImages:true,coverageRecorded:true,fullPDFRecorded:chat.history.at(-2).pdfContext?.mode==='full-pdf',coldRestart:seed.launch>1,noExternalApiCalls:true};
      }finally{host.selectedClient=originalClient;chat.draft=draft;chat.draftAttachments=files;panel.question.value=draft;await panel.persist();}
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
