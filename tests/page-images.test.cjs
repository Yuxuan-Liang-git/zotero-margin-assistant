const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup } = require('./helpers/margin-images.cjs');

async function setupPages() {
  const result = await setup(), { page } = result;
  try {
  const script = path.resolve(__dirname, '../src/page-images.js');
  if (fs.existsSync(script)) await page.addScriptTag({ path: script });
  assert.equal(await page.evaluate(() => typeof fixture.host.ensurePageImages), 'function');
  await page.evaluate(() => {
    const container = document.createElement('div'); container.className = 'pdf-container'; container.style.cssText = 'position:absolute;left:345px;top:20px;width:630px;height:800px;overflow:auto;background:#ddd';
    const pages = [0, 1].map(index => { const node = document.createElement('div'); node.className = 'page'; node.dataset.pageNumber = String(index + 1); node.tabIndex = 0; node.style.cssText = 'position:relative;margin:0 0 20px;background:white;width:600px;height:800px;'; node.innerHTML = '<p style="padding:35px">Original PDF text and equations remain visible.</p>'; container.append(node); return node; });
    document.body.append(container);
    const viewports = pages.map(() => ({ width: 600, height: 800, viewBox: [0, 0, 600, 800], rotation: 0, convertToPdfPoint: (x, y) => [x, 800 - y], convertToViewportPoint: (x, y) => [x, 800 - y] }));
    const f = fixture; f.session.reader.type = 'pdf';
    f.session.adapter = { document: () => document, pageCount: () => 2, currentPageIndex: () => 0, pdfViewer: {}, page: index => pages[index] ? { element: pages[index], viewport: viewports[index] } : null };
    f.session.cardRuntimes = () => [f.a, f.b];
    f.host.addon.controller.ensureSession = async () => f.session;
    f.files.set('/paper/current.pdf', new Uint8Array([37, 80, 68, 70]));
    f.host.IO.stat = async name => ({ size: f.files.get(name)?.byteLength || 0, lastModified: 20 });
    f.saves = 0; const save = f.host.save; f.host.save = async (...args) => { f.saves++; return save(...args); };
    f.host.decorateSession(f.session); f.pages = pages; f.container = container;
    f.pageLayer = () => f.host.pageImageLayers.get(f.session.reader);
    f.pagePaste = (index, text = '') => { pages[index].focus(); const data = new DataTransfer(); if (text) data.setData('text/plain', text); else data.items.add(f.file()); const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }); pages[index].dispatchEvent(event); return event.defaultPrevented; };
  });
  await page.waitForFunction(() => fixture.pageLayer()?.ready);
  return result;
  } catch (error) { await result.browser.close(); throw error; }
}

test('normal PDF paste supports dragging, proportional resizing, lock and persisted reopening', async () => {
  const { browser, page } = await setupPages();
  try {
    assert.equal(await page.evaluate(() => fixture.pagePaste(0)), true);
    await page.waitForFunction(() => fixture.state().pageImages?.length === 1 && document.querySelector('.zma-page-image img')?.naturalWidth === 360);
    const image = page.locator('.zma-page-image').first(); const before = await image.boundingBox();
    const saves = await page.evaluate(() => fixture.saves);
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2); await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 75, before.y + before.height / 2 + 45, { steps: 8 }); await page.mouse.up();
    await page.waitForFunction(count => fixture.saves === count + 1, saves);
    const moved = await image.boundingBox(); assert.ok(moved.x > before.x + 60); assert.ok(moved.y > before.y + 35);
    const handle = await image.getByRole('button', { name: '调整图片大小', exact: true }).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 70, handle.y + handle.height / 2 + 30); await page.mouse.up();
    await page.waitForFunction(count => fixture.saves === count + 2, saves);
    const resized = await image.boundingBox(); assert.ok(resized.width > moved.width + 30); assert.ok(Math.abs(resized.width / resized.height - 360 / 140) < 0.01);
    await image.getByRole('button', { name: '锁定', exact: true }).click(); await page.waitForFunction(() => fixture.state().pageImages[0].locked);
    const locked = await image.boundingBox(); await page.mouse.move(locked.x + 25, locked.y + 25); await page.mouse.down(); await page.mouse.move(locked.x + 100, locked.y + 90); await page.mouse.up();
    assert.ok(Math.abs((await image.boundingBox()).x - locked.x) < 1);
    assert.equal(await image.getByRole('button', { name: '移除页面图片', exact: true }).isDisabled(), true);
    await page.evaluate(async () => { fixture.pageLayer().destroy(); fixture.host.pageImageLayers.delete(fixture.session.reader); fixture.reload(); fixture.host.ensurePageImages(fixture.session); });
    await page.waitForFunction(() => document.querySelector('.zma-page-image img')?.naturalWidth === 360);
    const restored = await page.locator('.zma-page-image').boundingBox(); assert.ok(Math.abs(restored.x - locked.x) < 1); assert.ok(Math.abs(restored.width - locked.width) < 1);
    assert.equal(await page.evaluate(() => JSON.parse(fixture.files.get('/state.json')).pageImages[0].locked), true);
  } finally { await browser.close(); }
});

test('PDF page rerender reattaches saved images and keeps dragging functional', async () => {
  const { browser, page } = await setupPages();
  try {
    await page.evaluate(() => fixture.pagePaste(0));
    await page.waitForFunction(() => document.querySelector('.page .zma-page-image img')?.naturalWidth === 360);
    const saved = await page.evaluate(() => JSON.stringify(fixture.state().pageImages[0]));
    await page.evaluate(() => { fixture.pages[0].replaceChildren(); fixture.pageLayer().paint(); });
    assert.equal(await page.locator('.page .zma-page-image').count(), 1);
    await page.waitForFunction(() => document.querySelector('.page .zma-page-image img')?.naturalWidth === 360);
    assert.equal(await page.evaluate(() => JSON.stringify(fixture.state().pageImages[0])), saved);
    const image = page.locator('.page .zma-page-image'), box = await image.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20); await page.mouse.up();
    await page.waitForFunction(previous => JSON.stringify(fixture.state().pageImages[0]) !== previous, saved);
    assert.ok((await image.boundingBox()).x > box.x + 30);
  } finally { await browser.close(); }
});

test('PDF context insertion, file drop and existing margin assets use one persistence flow', async () => {
  const { browser, page } = await setupPages();
  try {
    await page.locator('.page').first().click({ button: 'right', position: { x: 80, y: 120 } });
    const labels = await page.evaluate(() => { const menu = []; fixture.host.onViewMenu({ reader: fixture.session.reader, params: {}, append: item => menu.push(item) }); fixture.pdfMenu = menu; return menu.map(item => item.label); });
    assert.ok(labels.includes('在此插入图片'));
    await page.evaluate(() => fixture.pdfMenu.find(item => item.label === '在此插入图片').onCommand());
    await page.waitForFunction(() => fixture.state().pageImages?.length === 1);
    await page.evaluate(() => { const data = new DataTransfer(); data.items.add(fixture.file()); data.items.add(fixture.file()); fixture.pages[0].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: 500, clientY: 250, dataTransfer: data })); });
    await page.waitForFunction(() => fixture.state().pageImages.length === 3);
    assert.equal(await page.evaluate(() => JSON.stringify(fixture.state().pageImages[1].matrix) === JSON.stringify(fixture.state().pageImages[2].matrix)), false);
    await page.evaluate(() => fixture.paste(fixture.a, [fixture.file()])); await page.waitForFunction(() => fixture.state().images.length === 4);
    await page.locator('.zma-place-image').first().click(); await page.waitForFunction(() => fixture.state().pageImages.length === 4);
    assert.equal(await page.evaluate(() => fixture.state().images.length), 4);
    assert.equal(await page.evaluate(() => fixture.pagePaste(0, '\\[a=b\\]')), false);
    const blocked = await page.evaluate(() => { const input = document.createElement('textarea'); fixture.pages[0].append(input); input.focus(); const data = new DataTransfer(); data.items.add(fixture.file()); const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }); input.dispatchEvent(event); return event.defaultPrevented; });
    assert.equal(blocked, false);
    const directory = path.resolve(__dirname, '../evidence/page-images-0190'); await page.screenshot({ path: path.join(directory, 'page-images.png') });
  } finally { await browser.close(); }
});

test('readonly, changed PDF and failed position saves preserve the last committed image', async () => {
  const { browser, page } = await setupPages();
  try {
    await page.evaluate(() => fixture.pagePaste(0)); await page.waitForFunction(() => fixture.state().pageImages?.length === 1);
    const original = await page.evaluate(() => JSON.stringify(fixture.state().pageImages[0]));
    await page.evaluate(() => { fixture.host.Z.Items.get(1).isEditable = () => false; fixture.pagePaste(0); });
    await page.waitForFunction(() => fixture.pageLayer().status.textContent.includes('只读'));
    assert.equal(await page.evaluate(() => fixture.state().pageImages.length), 1);
    await page.evaluate(() => { fixture.host.Z.Items.get(1).isEditable = () => true; fixture.host.save = async () => { throw Error('disk position failure'); }; });
    const result = await page.evaluate(async () => { const current = fixture.state().pageImages[0]; try { await fixture.pageLayer().change(current, { ...current, locked: true }); } catch {} return JSON.stringify(fixture.state().pageImages[0]); });
    assert.equal(result, original);
    await page.evaluate(async () => { fixture.host.IO.stat = async () => ({ size: 99, lastModified: 99 }); await fixture.pageLayer().refresh(); });
    assert.equal(await page.locator('.zma-page-image').count(), 0);
    assert.match(await page.locator('.zma-page-image-status').textContent(), /重新放置/);
    assert.equal(await page.evaluate(() => JSON.stringify(fixture.state().pageImages[0])), original);
  } finally { await browser.close(); }
});

test('Escape cancels an active drag and viewport rotation redraws the same saved PDF coordinates', async () => {
  const { browser, page } = await setupPages();
  try {
    await page.evaluate(() => fixture.pagePaste(0)); await page.waitForFunction(() => fixture.state().pageImages?.length === 1);
    const original = await page.evaluate(() => JSON.stringify(fixture.state().pageImages[0])), saves = await page.evaluate(() => fixture.saves);
    const box = await page.locator('.zma-page-image').boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50); await page.mouse.down(); await page.mouse.move(box.x + 110, box.y + 90); await page.keyboard.press('Escape'); await page.mouse.up();
    assert.equal(await page.evaluate(() => JSON.stringify(fixture.state().pageImages[0])), original); assert.equal(await page.evaluate(() => fixture.saves), saves);
    await page.evaluate(() => {
      const adapter = fixture.session.adapter, old = adapter.page(0), viewport = { width: 800, height: 600, viewBox: [0, 0, 600, 800], rotation: 90, convertToPdfPoint: (x, y) => [y, x], convertToViewportPoint: (x, y) => [y, x] };
      const previous = adapter.page; adapter.page = index => index === 0 ? { element: old.element, viewport } : previous(index);
      old.element.style.width = '800px'; old.element.style.height = '600px'; fixture.pageLayer().schedule();
    });
    await page.waitForFunction(() => Math.abs(document.querySelector('.zma-page-image').getBoundingClientRect().height - 360) < 1);
    assert.equal(await page.evaluate(() => JSON.stringify(fixture.state().pageImages[0])), original);
  } finally { await browser.close(); }
});

test('a failed position transaction cannot leak into a concurrently inserted image snapshot', async () => {
  const { browser, page } = await setupPages();
  try {
    await page.evaluate(() => fixture.pagePaste(0)); await page.waitForFunction(() => fixture.state().pageImages?.length === 1);
    const result = await page.evaluate(async () => {
      const originalSave = fixture.host.save; let release, entered, first = true;
      const started = new Promise(resolve => { entered = resolve; });
      fixture.host.save = async (...args) => { if (first) { first = false; entered(); await new Promise(resolve => { release = resolve; }); throw Error('position failure'); } return originalSave(...args); };
      const old = fixture.state().pageImages[0], changing = fixture.pageLayer().change(old, { ...old, locked: true }).catch(() => {});
      await started; const inserting = fixture.pageLayer().insert([fixture.file()]); release(); await changing; await inserting;
      const saved = JSON.parse(fixture.files.get('/state.json')); return { positions: saved.pageImages.length, locked: saved.pageImages[0].locked, assets: saved.images.length };
    });
    assert.deepEqual(result, { positions: 2, locked: false, assets: 2 });
  } finally { await browser.close(); }
});

test('the PDF export menu opens cancellable progress and reader closure disposes the export job', async () => {
  const { browser, page } = await setupPages();
  try {
    await page.addScriptTag({ path: path.resolve(__dirname, '../src/page-image-export.js') });
    assert.equal(await page.evaluate(() => typeof fixture.host.exportPageImages), 'function');
    await page.evaluate(() => fixture.pagePaste(0)); await page.waitForFunction(() => fixture.state().pageImages?.length === 1);
    await page.evaluate(() => {
      fixture.host.chooseConversationFile = async () => '/exports/paper.pdf';
      ZMAPageImageExport.exportPDF = async (_host, _reader, snapshot, _target, options) => {
        fixture.exportSnapshot = snapshot; options.onProgress('正在处理图片');
        return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('PDF 导出已取消')), { once: true }));
      };
      const menu = []; fixture.host.onViewMenu({ reader: fixture.session.reader, params: {}, append: item => menu.push(item) });
      menu.find(item => item.label === '导出带图片的 PDF').onCommand();
    });
    await page.getByRole('button', { name: '取消导出', exact: true }).waitFor();
    await page.waitForFunction(() => !!fixture.exportSnapshot);
    await page.evaluate(() => { fixture.state().pageImages[0].matrix[4] += 10; });
    assert.equal(await page.evaluate(() => fixture.exportSnapshot.placements[0].matrix[4] === fixture.state().pageImages[0].matrix[4]), false);
    await page.evaluate(() => fixture.host.closeReader(fixture.session.reader));
    assert.equal(await page.locator('.zma-image-export-progress').count(), 0);
    assert.equal(await page.evaluate(() => fixture.host.imageExports.size), 0);
  } finally { await browser.close(); }
});
