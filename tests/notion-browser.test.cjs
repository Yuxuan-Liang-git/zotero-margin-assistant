const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../src/notion-browser.js');

test('native Notion geometry catches up when animation frames are suspended in a background window', async () => {
  let listener;
  const node = () => ({ style: {}, setAttribute() {}, append() {}, remove() {}, addProgressListener: value => { listener = value; }, removeProgressListener() {}, currentURI: { spec: 'http://127.0.0.1/notion' } });
  const win = { document: { createXULElement: node }, requestAnimationFrame: () => 17, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {}, ResizeObserver: class { observe() {} disconnect() {} } };
  const rect = { left: 12, top: 108, width: 279, height: 407 };
  const anchor = { isConnected: true, getBoundingClientRect: () => rect, ownerDocument: { addEventListener() {}, removeEventListener() {} } };
  const reader = { _window: win, _tabContainer: { append() {} }, _iframe: { getBoundingClientRect: () => ({ left: 0, top: 73, width: 1000, height: 527 }) }, _iframeWindow: { innerWidth: 1000, innerHeight: 527, addEventListener() {}, removeEventListener() {} } };
  const adapter = create(reader, anchor, () => { rect.top = 83; rect.height = 432; }, { generateQI: () => () => {}, STATE_STOP: 1, BINDING_ABORTED: 99, NOTIFY_STATE_NETWORK: 1 });
  try {
    adapter.setVisible(true);
    assert.equal(adapter.portal.style.top, '181px');
    listener.onStateChange({ isTopLevel: true }, null, 1, 0);
    await new Promise(resolve => setTimeout(resolve, 160));
    assert.equal(adapter.portal.style.top, '156px');
    assert.equal(adapter.portal.style.height, '432px');
  } finally { adapter.destroy(); }
});
