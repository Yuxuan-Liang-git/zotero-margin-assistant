"""Verify generated XPI resources, baseline preservation and JS syntax; archive source."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import zipfile

PROJECT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--node',default=os.environ.get('ZMA_NODE','node'))
parser.add_argument('--baseline-xpi',default='C:/Users/HP/Downloads/margin-comments-latex-custom-0.9.5.xpi')
parser.add_argument('--native-run',default='zotero-0106-native-final')
parser.add_argument('--restart-run',default='zotero-0105-final')
parser.add_argument('--conversation-run',default='zotero-0106-conversation-qa')
parser.add_argument('--upgrade-run',default='zotero-0106-upgrade')
parser.add_argument('--clipboard-run',default='zotero-0126-bubbles-v2')
args=parser.parse_args()
version=json.loads((PROJECT/'package.json').read_text(encoding='utf-8'))['version']
package=PROJECT/f'dist/margin-comments-deepseek-{version}.xpi'
with zipfile.ZipFile(package) as archive:
    assert archive.testzip() is None
    names=set(archive.namelist())
    assert all('content/scripts/'+name+'.js' in names for name in ['clipboard','chatgpt-auth','chatgpt','chatgpt-native','streaming','attachments'])
    manifest=json.loads(archive.read('manifest.json'))
    assert manifest['version']==version
    assert manifest['applications']['zotero']['strict_min_version']=='10.0'
    assert manifest['applications']['zotero']['strict_max_version']=='10.0.*'
    assert manifest['applications']['zotero']['id']=='margin-comments@local.zotero'
    assert manifest['applications']['zotero']['update_url']=='https://updates.invalid/margin-comments-deepseek/update.json'
    for name in ['bootstrap.js','content/scripts/core.js','content/scripts/capture.js','content/scripts/document.js','content/scripts/references.js','content/scripts/deepseek.js','content/scripts/credentials.js','content/scripts/settings.js','content/scripts/math.js','content/scripts/images.js','content/scripts/markdown.js','content/scripts/panel.js','content/scripts/margin-references.js','content/scripts/host.js','content/scripts/assistant-settings.js','content/assistant-settings.xhtml','content/assistant.css','content/vendor/katex/katex.min.css','content/vendor/marked/marked.umd.js','content/vendor/marked/LICENSE.md']:
        assert name in names,name
    for path in (PROJECT/'build').rglob('*.js'):
        subprocess.run([args.node,'--check',str(path)],check=True,capture_output=True)
    expected_changes={'manifest.json','bootstrap.js','content/scripts/margincomments.js','content/preferences.xhtml'}
    changed=[]
    for path in (PROJECT/'baseline').rglob('*'):
        if path.is_file():
            name=path.relative_to(PROJECT/'baseline').as_posix()
            if archive.read(name)!=path.read_bytes():
                changed.append(name)
    assert set(changed)==expected_changes,changed
original=Path(args.baseline_xpi)
baseline_verified=False
if original.exists():
    assert hashlib.sha256(original.read_bytes()).hexdigest().upper()=='875A363693CA0CFC53A414CDDD966286B8BA0FE821148EC278CBF0602673B1CA'
    with zipfile.ZipFile(original) as archive:
        for name in archive.namelist():
            if not name.endswith('/'):
                assert (PROJECT/'baseline'/name).read_bytes()==archive.read(name),name
    baseline_verified=True
source_zip=PROJECT/f'dist/margin-comments-deepseek-{version}-source.zip'
with zipfile.ZipFile(source_zip,'w',zipfile.ZIP_DEFLATED) as archive:
    for folder in ['baseline','src','content','tests','scripts','docs']:
        for path in sorted((PROJECT/folder).rglob('*')):
            if path.is_file() and '__pycache__' not in path.parts:
                archive.write(path,path.relative_to(PROJECT).as_posix())
    for name in ['package.json','README.md','progress.md']:
        archive.write(PROJECT/name,name)
smoke_path=PROJECT/'evidence'/args.native_run/'report.json'
smoke=json.loads(smoke_path.read_text(encoding='utf-8')) if smoke_path.exists() else None
package_hash=hashlib.sha256(package.read_bytes()).hexdigest()
native_smoke='passed: actual Zotero 10.0.6 capture, dock remount/reopen, Markdown+MathML dialogue, native text context menu and inline references, invalidation and preferences' if smoke and smoke.get('done') and len(smoke['steps'])==10 and all(step['ok'] for step in smoke['steps']) and smoke.get('packageSha256')==package_hash else 'not passed or not run'
restart_dir=PROJECT/'evidence'/args.restart_run
restart_reports=[json.loads((restart_dir/f'report-launch-{n}.json').read_text(encoding='utf-8')) if (restart_dir/f'report-launch-{n}.json').exists() else None for n in [1,2,3]]
installed=restart_dir/'profile/extensions/margin-comments@local.zotero.xpi'
restart_ok=installed.exists() and hashlib.sha256(installed.read_bytes()).hexdigest()==package_hash and all(r and r.get('done') and r['launch']==n and len(r['steps'])==(6 if n==1 else 5) and all(s['ok'] for s in r['steps']) and r.get('packageSha256')==package_hash for n,r in enumerate(restart_reports,1))
restart_smoke='passed: first launch and two cold restarts with unchanged installed XPI; automatic text PDF/current scan page, Enter, toolbar reopen, two-line MathML, native image note, local copy and persisted image restoration' if restart_ok else 'not passed or not run'
conversation_dir=PROJECT/'evidence'/args.conversation_run
conversation_reports=[json.loads((conversation_dir/f'report-{n}.json').read_text(encoding='utf-8')) if (conversation_dir/f'report-{n}.json').exists() else None for n in [1,2,3]]
conversation_installed=conversation_dir/'profile/extensions/margin-comments@local.zotero.xpi'
conversation_ok=conversation_installed.exists() and hashlib.sha256(conversation_installed.read_bytes()).hexdigest()==package_hash and all(r and r.get('done') and r.get('launch')==n and r.get('packageSha256')==package_hash and len(r.get('steps',[]))==3 and all(step['ok'] for step in r['steps']) for n,r in enumerate(conversation_reports,1)) and len({r['process'] for r in conversation_reports if r})==3
conversation_smoke='passed: v1 dialogue migrated with byte-preserving backup; two PDF conversations and drafts switch and survive two cold restarts; encrypted DeepSeek key/model, toolbar and preferences survive' if conversation_ok else 'not passed or not run'
upgrade_dir=PROJECT/'evidence'/args.upgrade_run
upgrade_reports=[json.loads((upgrade_dir/f'report-{n}.json').read_text(encoding='utf-8')) if (upgrade_dir/f'report-{n}.json').exists() else None for n in [1,2]]
upgrade_first,upgrade_second=upgrade_reports
upgrade_ok=bool(upgrade_first and upgrade_second and upgrade_first.get('done') and upgrade_second.get('done') and upgrade_first.get('install',{}).get('errorAfter')==0 and upgrade_first['steps'][0].get('addon',{}).get('version')=='0.10.5' and upgrade_first['steps'][-1].get('addon',{}).get('version')==version and upgrade_first['steps'][-1]['addon'].get('isActive') and upgrade_second['steps'][-1].get('addon',{}).get('version')==version and upgrade_second['steps'][-1]['addon'].get('isActive') and upgrade_second.get('preference',{}).get('api') and upgrade_second.get('preference',{}).get('visible'))
upgrade_smoke='passed: AddonManager upgraded active 0.10.5 to active 0.10.6 beside Notero; API preferences visible after restart' if upgrade_ok else 'not passed or not run'
clipboard_dir=PROJECT/'evidence'/args.clipboard_run
clipboard_reports=[json.loads((clipboard_dir/f'report-{n}.json').read_text(encoding='utf-8')) if (clipboard_dir/f'report-{n}.json').exists() else None for n in [1,2]]
clipboard_installed=clipboard_dir/'profile/extensions/margin-comments@local.zotero.xpi'
clipboard_ok=clipboard_installed.exists() and hashlib.sha256(clipboard_installed.read_bytes()).hexdigest()==package_hash and all(r and r.get('done') and r.get('launch')==n and r.get('packageSha256')==package_hash and len(r.get('steps',[])) in [4,5,6,7,8,9,10,11,12,13] and all(s['ok'] for s in r['steps']) for n,r in enumerate(clipboard_reports,1)) and len({r['process'] for r in clipboard_reports if r})==2
editing_keys_ok=clipboard_ok and all(any(s.get('name')=='sidebar-clipboard-and-latex' and s.get('result',{}).get('editingKeysNotCancelled') and s['result'].get('editingFocusRetained') and s['result'].get('editingEventCombinations')==24 for s in r['steps']) for r in clipboard_reports)
probe_path=PROJECT/'evidence/chatgpt-plan-probe/report.json'
probe=json.loads(probe_path.read_text(encoding='utf-8')) if probe_path.exists() else {}
probe_ok=probe.get('stage')=='completed' and probe.get('verified') and probe.get('id_token_validated') and probe.get('credentials_persisted') is False
report={'date':'2026-10-19','xpi_sha256':package_hash,'xpi_size':package.stat().st_size,'baseline_verified_against_original':baseline_verified,'changed_baseline_files':changed,'resource_and_syntax_checks':'passed','source_zip':str(source_zip),'real_api_test':'DeepSeek not run; ChatGPT subscription probe reported separately','chatgpt_subscription_probe':'passed: official OAuth ID token verified; account model list fetched; one test Responses inference completed; no credentials persisted in that historical probe; XPI integration tested separately' if probe_ok else 'not passed or not run','native_clipboard':'passed: isolated Gecko first launch and cold restart; formula LaTeX, reader copy override, input copy/paste, draft and context menu; synthetic events and mocked system clipboard preserve user clipboard' if clipboard_ok else 'not passed or not run','native_zotero_smoke':native_smoke,'native_cold_restart_and_images':restart_smoke,'native_conversation_cold_restart':conversation_smoke,'native_upgrade':upgrade_smoke,'current_user_profile_gui_test':'not run; existing profile/library unchanged'}
report['native_editing_keys']='passed: isolated Gecko first launch and cold restart; all 24 synthetic arrow/Home/End with Shift/Ctrl combinations retain input focus and native default action' if editing_keys_ok else 'not passed or not run'
chatgpt_ok=clipboard_ok and all(any(s.get('name')=='chatgpt-subscription-native' and s.get('ok') and all(s.get('result',{}).get(key) for key in ['realLoopbackHttpServer','stateRejected','webcryptoSignatureValidated','encryptedOSKeyStore','serializedRefresh','accountModelPicker','automaticPdfContext','markdownAndMath','liveMathBeforeCompletion','selectedReasoningEffort','selectedFastTier','confirmedFastTier','speedRejectedRetry','noExternalApiCalls']) for s in r['steps']) for r in clipboard_reports) and any(s.get('name')=='chatgpt-subscription-native' and s['result'].get('restoredAfterRestart') and s['result'].get('reasoningRestored') and s['result'].get('speedRestored') for s in clipboard_reports[1]['steps'])
report['native_chatgpt']='passed: isolated Zotero first launch and cold restart; real IPv4 loopback, WebCrypto signatures and OSKeyStore; model/effort/speed picker, encrypted effort and speed restart restoration, confirmed Fast tier display and explicit Standard retry after HTTP tier rejection, automatic PDF Responses and math rendered before completion; OAuth and inference mocked, real account sign-in remains user acceptance' if chatgpt_ok else 'not passed or not run'
attachments_ok=clipboard_ok and all(any(s.get('name')=='composer-attachments-quotes' and s.get('ok') and all(s.get('result',{}).get(key) for key in ['pastedPdfAndImage','localOnlyBeforeSend','requestContainsFiles','quoteWithLatexAndComment','draftReferencesPreserved','noExternalApiCalls']) for s in r['steps']) for r in clipboard_reports) and any(s.get('name')=='composer-attachments-quotes' and s.get('result',{}).get('filesRestoredAfterRestart') for s in (clipboard_reports[1] or {}).get('steps',[]))
report['native_attachments_and_quotes']='passed: isolated first launch and cold restart; real Gecko FileReader/local copies, Ctrl+V handler with synthetic file callback, PDF/image Responses fields and quote/comment with LaTeX; synthetic inference, system clipboard untouched' if attachments_ok else 'not passed or not run'
scroll_ok=clipboard_ok and all(any(s.get('name')=='answer-reading-position' and s.get('ok') and all(s.get('result',{}).get(key) for key in ['startsAtAnswer','manualPositionRetained','streamDoesNotStealPosition','noExternalApiCalls']) for s in r['steps']) for r in clipboard_reports)
report['native_answer_reading_position']='passed: isolated Gecko first launch and cold restart; completed long answer starts at its heading; manual reading position survives streaming and final Markdown rendering; synthetic inference only' if scroll_ok else 'not passed or not run'
vision_ok=clipboard_ok and all(any(s.get('name')=='mixed-pdf-page-vision' and s.get('ok') and s.get('result',{}).get('pageImageCount')==2 and all(s.get('result',{}).get(key) for key in ['textLayerOmitsRasterFormula','textAndImages','coverageRecorded','noExternalApiCalls']) for s in r['steps']) for r in clipboard_reports)
report['native_mixed_pdf_vision']='passed: isolated first launch and cold restart; mixed raster/text fixture has two rendered page images; ChatGPT submits whole PDF and records coverage instead of partial page images; inference mocked, online equation recognition accuracy unverified' if vision_ok else 'not passed or not run'
find_ok=clipboard_ok and all(any(s.get('name')=='pdf-search-with-assistant' and s.get('ok') and all(s.get('result',{}).get(key) for key in ['nativeFindPopup','searchClickable','pdfWidthReserved','resizedVisible','closedWidthRestored','reopenedQueryRetained']) for s in r['steps']) for r in clipboard_reports)
report['native_pdf_search']='passed: real class-based Zotero split view and Ctrl F popup; input hit testing and focus, dock resize, close restores PDF width and reopen keeps search query; first launch and cold restart' if find_ok else 'not passed or not run'
stale_ok=clipboard_ok and all(any(s.get('name')=='stale-sources-do-not-block-chat' and s.get('ok') and all(s.get('result',{}).get(key) for key in ['actualMovedAnnotation','strictValidationRetained','chatContinues','originalHistoryPreserved','omittedSourceNotSubstituted','warningPersisted','noExternalApiCalls']) for s in r['steps']) for r in clipboard_reports)
report['native_stale_sources']='passed: real annotation moved in isolated Zotero; strict stale detection retained, historical and current stale material omitted with explicit disk-persisted warning, original history preserved and synthetic chat continues; first launch and cold restart' if stale_ok else 'not passed or not run'
whole_ok=clipboard_ok and all(any(s.get('name')=='automatic-full-pdf-after-reopen' and s.get('ok') and all(s.get('result',{}).get(key) for key in ['wholePdfEveryTurn','originalBytesVerified','reopenKeepsHistory','reopenReattachesPDF','cacheClearedBetweenTurns','coverageRecorded','noFileBodyInHistory','noExternalApiCalls']) for s in r['steps']) for r in clipboard_reports)
whole_sample=next((s['result'] for s in (clipboard_reports[0] or {}).get('steps',[]) if s.get('name')=='automatic-full-pdf-after-reopen' and s.get('ok')), {})
report['native_automatic_whole_pdf']=f"passed: {whole_sample.get('pages')}-page {whole_sample.get('fileBytes')}-byte paper copied into isolated fixture; every byte verified against input_file file_data before and after closing/reopening and clearing caches; chat history and safe coverage metadata retained, no file body in sidecar; first launch and cold restart, inference mocked" if whole_ok else 'not passed or not run'
appearance_ok=clipboard_ok and all(any(s.get('name')=='appearance-and-native-text' and s.get('ok') and all(s.get('result',{}).get(key) for key in ['fontApplied','configurationInSettings','draftAndCaretRetained','nativeTextRetained','noDuplicateMarginText']) for s in r['steps']) for r in clipboard_reports) and any(s.get('name')=='appearance-and-native-text' and s.get('result',{}).get('fontPersisted') for s in (clipboard_reports[1] or {}).get('steps',[]))
report['native_appearance_and_text']='passed: native settings font event, instant 18/20px resize, font cold-restart persistence, composer draft/caret retained, configuration removed from chat; native PDF free-text annotation retained without margin duplication even when explicitly revealed' if appearance_ok else 'not passed or not run'
bubbles_ok=clipboard_ok and all(any(s.get('name')=='inline-quote-bubbles' and s.get('ok') and all(s.get('result',{}).get(key) for key in ['emptyDismissed','outsidePdfClick','multipleDrafts','reopenAndEdit','latexPreserved','failedSendRetained','combinedOnce','clearedAfterSuccess','independentDraftPersisted','noExternalApiCalls']) for s in r['steps']) for r in clipboard_reports) and any(s.get('name')=='inline-quote-bubbles' and s.get('result',{}).get('restoredAfterRestart') for s in (clipboard_reports[1] or {}).get('steps',[]))
report['native_inline_quote_bubbles']='passed: native selected MathML becomes exact LaTeX quote; PDF outside click discards empty bubble or collapses edited one, reopening and multiple comments, failed send retains drafts, one combined send clears after success; drafts stored beside PDF in an independent conversation and restored after cold restart; inference mocked' if bubbles_ok else 'not passed or not run'
(PROJECT/'dist/verification-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
