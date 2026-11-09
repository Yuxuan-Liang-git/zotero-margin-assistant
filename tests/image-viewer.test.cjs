const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup } = require('./helpers/margin-images.cjs');

async function insertWideImage(page) {
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 240;
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, 2400, 240);
    context.fillStyle = '#17365d'; context.font = '32px sans-serif';
    context.fillText('Readable original image: e(k) = y(k) - H(q, theta) u(k)', 40, 75);
    context.fillStyle = '#111'; context.font = '25px sans-serif';
    context.fillText('A long equation must remain readable at original size, with horizontal panning.', 40, 135);
    context.fillText('Original pixels are preserved in the local image and the Zotero note.', 40, 190);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    fixture.paste(fixture.a, [new File([blob], 'wide-equation.png', { type: 'image/png' })]);
  });
  await page.waitForFunction(() => fixture.state().images.length === 1 && fixture.a.card.querySelector('.zma-inline-image img')?.naturalWidth === 2400);
}

test('the real margin thumbnail opens a readable viewer with fit, original size, zoom and pan', async () => {
  const { browser, page } = await setup();
  try {
    await insertWideImage(page);
    assert.equal(await page.locator('.zma-view-image').count(), 1);
    await page.locator('.zma-inline-image img').click();
    const dialog = page.getByRole('dialog', { name: '图片查看器' });
    await dialog.waitFor();
    await page.waitForFunction(() => document.querySelector('.zma-image-viewer img')?.naturalWidth === 2400);
    let bounds = await page.locator('.zma-image-viewer img').boundingBox(); assert.ok(bounds.width > 600 && bounds.width < 1000);
    await dialog.getByRole('button', { name: '100% 原尺寸', exact: true }).click();
    bounds = await page.locator('.zma-image-viewer img').boundingBox(); assert.equal(Math.round(bounds.width), 2400);
    const viewport = page.locator('.zma-image-viewport'), area = await viewport.boundingBox();
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.down(); await page.mouse.move(area.x + 100, area.y + area.height / 2); await page.mouse.up();
    assert.ok(await viewport.evaluate(node => node.scrollLeft) > 50);
    await dialog.getByRole('button', { name: '放大', exact: true }).click();
    bounds = await page.locator('.zma-image-viewer img').boundingBox(); assert.ok(bounds.width > 2400);
    await dialog.getByRole('button', { name: '适应窗口', exact: true }).click();
    bounds = await page.locator('.zma-image-viewer img').boundingBox(); assert.ok(bounds.width < 1000);
    const folder = path.resolve(__dirname, '../evidence/page-images-0190'); fs.mkdirSync(folder, { recursive: true });
    await page.screenshot({ path: path.join(folder, 'wide-image-viewer.png') });
  } finally { await browser.close(); }
});

test('viewer Escape and close restore focus and reopening reuses one viewer', async () => {
  const { browser, page } = await setup();
  try {
    await insertWideImage(page);
    assert.equal(await page.locator('.zma-view-image').count(), 1);
    await page.locator('.zma-view-image').click();
    await page.getByRole('dialog', { name: '图片查看器' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog', { name: '图片查看器' }).isVisible(), false);
    assert.equal(await page.locator('.zma-view-image').evaluate(node => node === document.activeElement), true);
    await page.locator('.zma-view-image').click();
    await page.getByRole('dialog', { name: '图片查看器' }).getByRole('button', { name: '关闭', exact: true }).click();
    await page.locator('.zma-view-image').click();
    assert.equal(await page.locator('.zma-image-viewer').count(), 1);
    await page.evaluate(() => fixture.host.imageViewers.get(fixture.session.reader).destroy());
    assert.equal(await page.locator('.zma-image-viewer').count(), 0);
  } finally { await browser.close(); }
});
