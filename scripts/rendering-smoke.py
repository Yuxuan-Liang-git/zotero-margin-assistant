"""Isolated Gecko regression for CJK math punctuation and Markdown strong text."""
import argparse,subprocess,sys,zipfile
from pathlib import Path
project=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--run-name',required=True);parser.add_argument('--pdf-fixture');args=parser.parse_args()
command=[sys.executable,str(project/'scripts/web-smoke.py'),'--run-name',args.run_name]
if args.pdf_fixture:command+=['--pdf-fixture',args.pdf_fixture]
subprocess.run(command,check=True)
qa=project/'evidence'/args.run_name/'profile/extensions/zma-pdf-history-qa@local.zotero.xpi'
with zipfile.ZipFile(qa) as archive:
 manifest=archive.read('manifest.json');bootstrap=archive.read('bootstrap.js').decode()
insertion=r'''
    await check('cjk-markdown-math-rendering',async()=>{
      const panel=await host.panel(reader),doc=panel.doc,scratch=doc.createElementNS('http://www.w3.org/1999/xhtml','article');panel.node.append(scratch);
      const source='直观理解：**坐标轴没有对准。**因此出现投影。\n\n\\[\\text{调整 }L_s、R\\;\\longrightarrow\\;\\psi_m\\]\n\n`**代码。**原样`';
      try{
        panel.renderAnswer(scratch,source);if(scratch.querySelectorAll('math').length!==1||scratch.querySelector('strong')?.textContent!=='坐标轴没有对准。'||scratch.querySelector('code')?.textContent!=='**代码。**原样')throw new Error('CJK math/bold did not render in native sidebar');
        const formula=source.match(/\\\[[\s\S]*?\\\]/)[0];if(scratch.querySelector('math').getAttribute('data-zma-latex')!==formula)throw new Error('Original formula changed');
        const stored=JSON.parse(JSON.stringify({role:'assistant',content:source,materials:[]})),card=panel.messageCard(stored,0);if(card.querySelectorAll('math').length!==1||card.querySelector('.zma-answer strong')?.textContent!=='坐标轴没有对准。')throw new Error('History rendering differs');
        panel.renderAnswer(scratch,'\\[\\invalidCommand{x}\\]');if(scratch.querySelector('math')||!scratch.textContent.includes('invalidCommand'))throw new Error('Invalid command silently changed');
        return {chinesePunctuation:true,boldBeforeProse:true,codeLiteral:true,latexPreserved:true,historyRerender:true,invalidCommandPreserved:true,noExternalApiCalls:true};
      }finally{scratch.remove();}
    });
'''
point='    await host.store.flush();';assert bootstrap.count(point)==1
bootstrap=bootstrap.replace(point,insertion+'\n'+point)
with zipfile.ZipFile(qa,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.writestr('manifest.json',manifest);archive.writestr('bootstrap.js',bootstrap)
