"""Rebuild the custom XPI without editing the preserved baseline."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

PROJECT = Path(__file__).resolve().parent.parent

def replace_once(text, old, new):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'Expected one integration point, found {count}: {old[:70]}')
    return text.replace(old, new, 1)

def build():
    out = PROJECT / 'build'
    # Only generated build output is removed, after absolute-target and link checks.
    if out.resolve() != PROJECT / 'build' or out.is_symlink() or out.is_junction():
        raise RuntimeError('Refusing to clean a redirected build directory')
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(exist_ok=True)
    shutil.copytree(PROJECT / 'baseline', out, dirs_exist_ok=True)
    manifest = json.loads((out / 'manifest.json').read_text(encoding='utf-8'))
    version = json.loads((PROJECT / 'package.json').read_text(encoding='utf-8'))['version']
    manifest['version'] = version
    manifest['name'] = 'Margin Comments + DeepSeek'
    manifest['description'] = '页边批注、LaTeX、DeepSeek 文档提问、编号前文引用与笔记图片'
    # Zotero 10.0.6 requires this field even for manually distributed add-ons.
    # Reserved .invalid avoids accidentally installing an unrelated upstream build.
    manifest['applications']['zotero']['update_url'] = 'https://updates.invalid/margin-comments-deepseek/update.json'
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    script = out / 'content/scripts/margincomments.js'
    text = script.read_text(encoding='utf-8')
    text = replace_once(text, 'const markup = katex.renderToString(expression, {', 'const markup = katex.renderToString(_globalThis.ZMAMath?.normalizeDisplay(expression, delimiter.display) ?? expression, {')
    text = replace_once(text, 'const allowed = [...SUPPORTED_FORMATS, "br", "div"];', 'const allowed = [...SUPPORTED_FORMATS, "br", "div"];\n        if (_globalThis.ZMAReferences.isAllowedAnchor(element)) allowed.push("a");')
    text = replace_once(text, '''        while (element.attributes.length) {
          element.removeAttribute(element.attributes[0].name);
        }
        cleanEditorDom(element);''', '''        if (element.localName === "a") _globalThis.ZMAReferences.cleanAnchor(element);
        else while (element.attributes.length) {
          element.removeAttribute(element.attributes[0].name);
        }
        cleanEditorDom(element);''')
    text = replace_once(text, '''      const child = original;
      if (child.nodeType === ELEMENT_NODE && SUPPORTED_FORMATS.includes(child.localName)) {''', '''      const child = original;
      if (child.nodeType === ELEMENT_NODE && _globalThis.ZMAReferences.unformatLink(child)) continue;
      if (child.nodeType === ELEMENT_NODE && SUPPORTED_FORMATS.includes(child.localName)) {''')
    text = replace_once(text, '''    root.textContent = value;
    formatTextNodes(root);
  }
  function readStoredComment''', '''    root.textContent = value;
    formatTextNodes(root);
    _globalThis.ZMAReferences.render(root);
  }
  function readStoredComment''')
    text = replace_once(text, '''      return runtime;
    }
    layoutPage(mounted)''', '''      Zotero.MarginComments.assistant?.attachCard(this, runtime);
      return runtime;
    }
    layoutPage(mounted)''')
    text = replace_once(text, '''  _globalThis.addon = instance;''', '''  instance.bridge = { renderStoredComment, readStoredComment, renderMathPreview, installMathResources };
  _globalThis.addon = instance;''')
    text = replace_once(text, '''      this.invalidateRuntimeHeight(runtime);
    }
    renderComment(root, value)''', '''      this.invalidateRuntimeHeight(runtime);
      Zotero.MarginComments.assistant?.syncReferences(this, runtime);
    }
    renderComment(root, value)''')
    script.write_text(text, encoding='utf-8')
    bootstrap = (out / 'bootstrap.js').read_text(encoding='utf-8')
    bootstrap = replace_once(bootstrap, '  context._globalThis = context;', '''  context._globalThis = context;
  Services.scriptloader.loadSubScript(rootURI + "content/vendor/marked/marked.umd.js", context);
  for (const name of ["core", "capture", "document", "references", "deepseek", "settings", "math", "markdown", "panel", "margin-references", "images", "host"]) {
    Services.scriptloader.loadSubScript(rootURI + "content/scripts/" + name + ".js", context);
  }''')
    bootstrap = replace_once(bootstrap, '  await Zotero.MarginComments.hooks.onStartup();', '''  await Zotero.MarginComments.hooks.onStartup();
  const assistant = new context.ZMAHost.Host(Zotero.MarginComments, {
    Zotero, IOUtils, PathUtils, window: Zotero.getMainWindow(),
    unwrap: value => Components.utils.waiveXrays(value),
    cloneInto: (value, target) => Components.utils.cloneInto(value, Components.utils.getGlobalForObject(target)),
    chooseImage: async win => {
      const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
      const picker = new FilePicker();picker.init(win, '插入页边批注图片', picker.modeOpen);
      picker.appendFilter('图片 (PNG / JPEG / GIF / WebP)', '*.png; *.jpg; *.jpeg; *.gif; *.webp');
      return await picker.show() === picker.returnOK ? picker.file : null;
    }
  });
  Zotero.MarginComments.assistant = assistant;
  await assistant.start();
  for (const session of Zotero.MarginComments.controller.sessions.values()) await session.refresh(true);''')
    bootstrap = replace_once(bootstrap, '  return Zotero.MarginComments?.hooks.onMainWindowLoad(window);', '''  Zotero.MarginComments?.assistant?.mainWindowLoaded(window);
  return Zotero.MarginComments?.hooks.onMainWindowLoad(window);''')
    bootstrap = replace_once(bootstrap, '  return Zotero.MarginComments?.hooks.onMainWindowUnload(window);', '''  Zotero.MarginComments?.assistant?.mainWindowUnloaded(window);
  return Zotero.MarginComments?.hooks.onMainWindowUnload(window);''')
    bootstrap = replace_once(bootstrap, 'function shutdown({ resourceURI, rootURI }, reason) {\n  if (reason === APP_SHUTDOWN) return;', 'async function shutdown({ resourceURI, rootURI }, reason) {\n  await Zotero.MarginComments?.assistant?.stop();\n  if (reason === APP_SHUTDOWN) return;')
    bootstrap = replace_once(bootstrap, '  Zotero.MarginComments?.hooks.onShutdown();', '  await Zotero.MarginComments?.hooks.onShutdown();')
    (out / 'bootstrap.js').write_text(bootstrap, encoding='utf-8')
    for path in (PROJECT / 'src').glob('*.js'):
        shutil.copy2(path, out / 'content/scripts' / path.name)
    shutil.copy2(PROJECT / 'src/assistant.css', out / 'content/assistant.css')
    shutil.copytree(PROJECT / 'content', out / 'content', dirs_exist_ok=True)
    prefs = (out / 'content/preferences.xhtml').read_text(encoding='utf-8')
    prefs = replace_once(prefs, 'registerPreferencePaneWindow(window)"', 'registerPreferencePaneWindow(window); Zotero.MarginComments.assistant?.bindPreferencePaneWindow(window)"')
    prefs = replace_once(prefs, '</vbox>', (PROJECT / 'content/deepseek-settings.inc.xhtml').read_text(encoding='utf-8') + '\n</vbox>')
    (out / 'content/preferences.xhtml').write_text(prefs, encoding='utf-8')
    dist = PROJECT / 'dist'
    dist.mkdir(exist_ok=True)
    package = dist / f'margin-comments-deepseek-{version}.xpi'
    with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(out.rglob('*')):
            if path.is_file():
                info = zipfile.ZipInfo(path.relative_to(out).as_posix(), (2026,10,13,0,0,0))
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, path.read_bytes())
    result = {'package':str(package), 'sha256':hashlib.sha256(package.read_bytes()).hexdigest(), 'size':package.stat().st_size}
    (dist / 'build-report.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(result))

if __name__ == '__main__':
    build()
