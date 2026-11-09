const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const project = path.resolve(__dirname, '..');

async function setup() {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
    await page.setContent('<main style="width:300px;padding:20px"></main>');
    await page.addStyleTag({ content: '.zmc-card-footer{display:flex}.zmc-card-footer:has(.zmc-save-state:empty){display:none}' });
    await page.addStyleTag({ path: path.join(project, 'src/assistant.css') });
    for (const name of ['core', 'deepseek', 'capture', 'attachments', 'images', 'panel', 'margin-references', 'margin-images', 'host']) {
      const file = path.join(project, 'src', name + '.js');
      if (fs.existsSync(file)) await page.addScriptTag({ path: file });
    }
    await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 140;
      const context = canvas.getContext('2d'); context.fillStyle = '#f4f6ff'; context.fillRect(0, 0, 360, 140);
      context.fillStyle = '#243d7c'; context.font = '18px sans-serif'; context.fillText('Margin image fixture', 20, 32);
      context.fillStyle = '#111'; context.font = '16px serif'; context.fillText('e(k) = y(k) - H(q,theta) u(k)', 20, 75);
      context.fillText('Local note + PDF sibling copy', 20, 112);
      const png = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0));
      const files = new Map([['/chosen/figure.png', png]]), notes = new Map(), embedded = new Map();
      let id = 20, uuid = 0;
      Object.defineProperty(window.crypto, 'randomUUID', { value: () => '12345678-1234-4234-8234-' + String(++uuid).padStart(12, '0') });
      const pdf = { id: 1, key: 'PDF00001', libraryID: 1, parentID: 2, isPDFAttachment: () => true, isEditable: () => true, getFilePathAsync: async () => '/paper/current.pdf', getField: () => 'Paper fixture' };
      const annotations = new Map();
      for (const [key, number] of [['ANNOT001', 0], ['ANNOT002', 1]]) annotations.set(key, { key, parentID: 1, libraryID: 1, isAnnotation: () => true, isEditable: () => !annotations.get(key).readOnly, annotationPosition: JSON.stringify({ pageIndex: number, rects: [[10, 20, 30, 40]] }) });
      const Z = { DataDirectory: { dir: '/data' }, Libraries: { get: () => ({ libraryType: 'user' }) },
        Items: { get: n => n === 1 ? pdf : n === 2 ? { id: 2, isRegularItem: () => true } : notes.get(n) || embedded.get(n), getByLibraryAndKey: (_libraryID, key) => annotations.get(key) || [...notes.values(), ...embedded.values()].find(item => item.key === key) },
        Item: class {
          constructor() { this.id = ++id; this.key = 'NOTE' + String(this.id).padStart(4, '0'); }
          isNote() { return true; } getNote() { return this.html || ''; } setNote(html) { this.html = html; }
          async saveTx() { notes.set(this.id, this); } async eraseTx() { notes.delete(this.id); }
        },
        Attachments: { importEmbeddedImage: async ({ blob, parentItemID }) => { const image = { id: ++id, key: 'IMG' + String(id).padStart(5, '0'), parentID: parentItemID, bytes: new Uint8Array(await blob.arrayBuffer()), async eraseTx() { embedded.delete(this.id); } }; embedded.set(image.id, image); return image; } }
      };
      const host = new ZMAHost.Host({ controller: {} }, { Zotero: Z, window, PathUtils: { join: (...parts) => parts.join('/'), parent: name => name.slice(0, name.lastIndexOf('/')) },
        IOUtils: { exists: async name => files.has(name), stat: async name => ({ size: files.get(name)?.byteLength || 0 }), makeDirectory: async () => {}, read: async name => { if (!files.has(name)) throw Error('missing fixture'); return files.get(name); }, write: async (name, bytes) => files.set(name, new Uint8Array(bytes)), remove: async name => files.delete(name) },
        chooseImage: async () => '/chosen/figure.png'
      });
      let state = ZMACore.emptyState(); host.running = true; host.bindReferences = () => {}; host.load = async () => state;
      host.save = async (_reader, value) => files.set('/state.json', JSON.stringify(ZMACore.cleanState(value)));
      host.notify = text => { globalThis.lastAlert = text; };
      host.readClipboardAssets = () => [];
      const reader = { itemID: 1 }, session = { reader, persist: async runtime => { runtime.currentValue = runtime.editor.textContent; }, invalidateRuntimeHeight() {}, relayoutRuntime() {} };
      const createCard = key => {
        const card = document.createElement('article'); card.className = 'zmc-card'; card.style.cssText = 'border:1px solid #888;padding:10px;margin-bottom:20px';
        card.innerHTML = '<div class="zmc-card-editor" contenteditable="true" style="min-height:35px">公式说明</div><footer class="zmc-card-footer"><span class="zmc-save-state"></span></footer>'; document.querySelector('main').append(card);
        const editor = card.querySelector('[contenteditable]');
        // The native editor stops paste bubbling. Its ordinary text insertion
        // is represented by execCommand because synthetic paste has no default.
        editor.addEventListener('paste', event => { event.stopPropagation(); if (!event.defaultPrevented) { editor.focus(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); } });
        const runtime = { card, editor, annotation: annotations.get(key), currentValue: editor.textContent };
        host.attachCard(session, runtime); return runtime;
      };
      const a = createCard('ANNOT001'), b = createCard('ANNOT002');
      const transfer = images => { const data = new DataTransfer(); for (const image of images) data.items.add(image); return data; };
      const file = () => new File([png], 'figure.png', { type: 'image/png' });
      const paste = (runtime, images = [], text = '') => { const data = transfer(images); if (text) data.setData('text/plain', text); const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }); runtime.editor.dispatchEvent(event); return event.defaultPrevented; };
      const drop = (runtime, images) => { const data = transfer(images), over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }); runtime.editor.dispatchEvent(over); const highlighted = runtime.card.classList.contains('zma-image-drop-target'); const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }); runtime.editor.dispatchEvent(event); return { prevented: event.defaultPrevented, highlighted }; };
      globalThis.fixture = { host, session, a, b, png, files, notes, embedded, annotations, file, paste, drop, createCard, state: () => state, reload: () => { state = ZMACore.cleanState(JSON.parse(files.get('/state.json'))); } };
    });
    return { browser, page };
  } catch (error) { await browser.close(); throw error; }
}

test('pasting a screenshot through the margin editor saves one native image and displays its local copy', async () => {
  const { browser, page } = await setup();
  try {
    assert.equal(await page.getByRole('button', { name: '插入图片', exact: true }).first().isVisible(), true);
    assert.equal(await page.evaluate(() => fixture.paste(fixture.a, [fixture.file()])), true);
    await page.waitForFunction(() => fixture.state().images.length === 1 && document.querySelector('.zma-inline-image img')?.naturalWidth === 360);
    const result = await page.evaluate(() => ({ notes: fixture.notes.size, embedded: fixture.embedded.size, copies: [...fixture.files.keys()].filter(name => name.includes('/margin-comments-images/')).length, text: fixture.a.editor.textContent, nativeHTML: [...fixture.notes.values()][0].getNote() }));
    assert.equal(result.notes, 1); assert.equal(result.embedded, 1); assert.equal(result.copies, 1);
    assert.equal(result.text, '公式说明'); assert.match(result.nativeHTML, /data-attachment-key="IMG/);
    await page.getByRole('button', { name: '插入图片', exact: true }).first().click();
    await page.waitForFunction(() => fixture.state().images.length === 2);
  } finally { await browser.close(); }
});

test('dropping multiple images and pasting into another margin serialize without losing either annotation', async () => {
  const { browser, page } = await setup();
  try {
    const result = await page.evaluate(() => { const drop = fixture.drop(fixture.a, [fixture.file(), fixture.file()]); fixture.paste(fixture.b, [fixture.file()]); return drop; });
    assert.deepEqual(result, { prevented: true, highlighted: true });
    await page.waitForFunction(() => fixture.state().images.length === 3 && document.querySelectorAll('.zma-inline-image img').length === 3);
    assert.deepEqual(await page.evaluate(() => ({ notes: fixture.notes.size, a: fixture.state().images.filter(image => image.annotationKey === 'ANNOT001').length, b: fixture.state().images.filter(image => image.annotationKey === 'ANNOT002').length })), { notes: 1, a: 2, b: 1 });
    const folder = path.join(project, 'evidence/images-0181'); fs.mkdirSync(folder, { recursive: true }); await page.locator('main').screenshot({ path: path.join(folder, 'margin-image-input.png') });
  } finally { await browser.close(); }
});

test('Gecko clipboard fallback accepts screenshots while plain LaTeX paste reaches the normal editor', async () => {
  const { browser, page } = await setup();
  try {
    assert.equal(await page.evaluate(() => { fixture.host.readClipboardAssets = options => { globalThis.clipboardBudget = options?.maxBytes; return [{ bytes: fixture.png }]; }; return fixture.paste(fixture.a); }), true);
    await page.waitForFunction(() => fixture.state().images.length === 1);
    assert.equal(await page.evaluate(() => clipboardBudget), 10 * 1024 * 1024);
    const latex = String.raw`\[a=b \\ c=d\]`;
    const result = await page.evaluate(text => { fixture.host.readClipboardAssets = () => []; fixture.a.editor.focus(); const range = document.createRange(); range.selectNodeContents(fixture.a.editor); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); return { prevented: fixture.paste(fixture.a, [], text), text: fixture.a.editor.textContent }; }, latex);
    assert.equal(result.prevented, false); assert.equal(result.text, latex);
    assert.equal(await page.evaluate(() => fixture.state().images.length), 1);
  } finally { await browser.close(); }
});

test('readonly and invalid image inputs display feedback without changing the PDF image records', async () => {
  const { browser, page } = await setup();
  try {
    await page.evaluate(() => { fixture.annotations.get('ANNOT001').readOnly = true; fixture.paste(fixture.a, [fixture.file()]); });
    await page.waitForFunction(() => fixture.a.card.textContent.includes('只读'));
    assert.equal(await page.evaluate(() => fixture.state().images.length), 0);
    await page.evaluate(() => fixture.drop(fixture.b, [new File(['<svg></svg>'], 'unsafe.svg', { type: 'image/svg+xml' })]));
    await page.waitForFunction(() => fixture.b.card.textContent.includes('图片格式'));
    assert.equal(await page.evaluate(() => fixture.state().images.length + fixture.notes.size + fixture.embedded.size), 0);
  } finally { await browser.close(); }
});

test('card reconstruction restores images and attaching twice does not duplicate a paste listener', async () => {
  const { browser, page } = await setup();
  try {
    await page.evaluate(() => { fixture.host.attachCard(fixture.session, fixture.a); fixture.paste(fixture.a, [fixture.file()]); });
    await page.waitForFunction(() => fixture.state().images.length === 1 && document.querySelector('.zma-inline-image img')?.naturalWidth === 360);
    await page.evaluate(() => { fixture.a.card.remove(); fixture.reload(); fixture.a = fixture.createCard('ANNOT001'); });
    await page.waitForFunction(() => fixture.a.card.querySelector('.zma-inline-image img')?.naturalWidth === 360);
    await page.evaluate(() => fixture.paste(fixture.a, [fixture.file()]));
    await page.waitForFunction(() => fixture.state().images.length === 2 && fixture.a.card.querySelectorAll('.zma-inline-image').length === 2);
    assert.equal(await page.evaluate(() => fixture.notes.size), 1);
  } finally { await browser.close(); }
});
