const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup } = require('./helpers/margin-images.cjs');
const project = path.resolve(__dirname, '..');

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
