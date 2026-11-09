// Exercise mandatory manifest validation taken from the installed Zotero runtime.
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const project=path.resolve(__dirname,'..');
const python=process.env.ZMA_PYTHON||'C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
function installedValidation(){
  const omni=process.env.ZMA_ZOTERO_OMNI||'C:/Program Files/Zotero/omni.ja';
  const result=cp.spawnSync(python,['-c','import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read("modules/Extension.sys.mjs").decode("utf-8"))',omni],{encoding:'utf8',maxBuffer:10*1024*1024});
  assert.equal(result.status,0,result.stderr);
  const start=result.stdout.indexOf('if (this.type == "extension") {',result.stdout.indexOf('async parseManifest()'));
  const end=result.stdout.indexOf('manifest.browser_specific_settings = undefined;',start);
  assert.ok(start>0&&end>start,'installed manifest guards should be located');return result.stdout.slice(start,end)+'\n}';
}
function validate(manifest,guard){const errors=[];vm.runInNewContext(guard,{manifest,type:'extension',manifestError:e=>errors.push(e)});return errors;}
test('real Zotero manifest guards accept shipped XPI metadata',()=>{
  const guard=installedValidation();const manifest=JSON.parse(fs.readFileSync(project+'/build/manifest.json','utf8'));
  assert.deepEqual(validate(manifest,guard),[], 'Zotero rejects missing mandatory manifest fields');
});
test('regression demonstrates that omitted update_url is rejected by installed Zotero',()=>{
  const guard=installedValidation();const manifest=JSON.parse(fs.readFileSync(project+'/baseline/manifest.json','utf8'));
  delete manifest.applications.zotero.update_url;
  assert.deepEqual(validate(manifest,guard),['applications.zotero.update_url not provided']);
});
