const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../src/notion-browser.js');

// Only the XUL/Gecko boundary is substituted. create(), load(), state callbacks
// and resource ownership below execute the production Notion adapter.
function setup() {
  const browsers = [], loads = [], states = [];
  const make = tag => {
    const attributes = new Map(), events = new Map();
    const node = {
      tag, style: {}, isConnected: false, currentURI: { spec: 'about:blank' },
      frameLoader: { remoteTab: {} }, browsingContext: {},
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name); },
      get isRemoteBrowser() { return attributes.get('remote') === 'true'; },
      append(child) { child.parent = this; child.isConnected = this.isConnected; },
      remove() { this.isConnected = false; },
      addEventListener(name, callback) { events.set(name, callback); },
      removeEventListener(name) { events.delete(name); },
      addProgressListener(listener) { this.progress = listener; },
      removeProgressListener() { this.progress = null; }
    };
    if (tag === 'browser') browsers.push(node);
    return node;
  };
  const win = { document: { createXULElement: make }, requestAnimationFrame: () => 1,
    cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {},
    ResizeObserver: class { observe() {} disconnect() {} } };
  const anchor = { isConnected: true,
    getBoundingClientRect: () => ({ left: 10, top: 40, width: 380, height: 500 }),
    ownerDocument: { addEventListener() {}, removeEventListener() {} } };
  const parent = { append(node) { node.isConnected = true; } };
  const reader = { _window: win, _tabContainer: parent,
    _iframe: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }) },
    _iframeWindow: { innerWidth: 1000, innerHeight: 800, addEventListener() {}, removeEventListener() {} } };
  const platform = { generateQI: () => () => {}, STATE_STOP: 1, BINDING_ABORTED: 99, NOTIFY_STATE_NETWORK: 1,
    load(browser, url) {
      if (!browser.frameLoader?.remoteTab) {
        throw new TypeError('can\'t access property "maybeCancelContentJSExecution", this._browser.frameLoader.remoteTab is null');
      }
      loads.push({ browser, url });
      browser.setAttribute('remote', 'true');
      browser.currentURI = { spec: url };
      queueMicrotask(() => browser.progress?.onStateChange({ isTopLevel: true }, null, 1, 0));
    }
  };
  const adapter = create(reader, anchor, info => states.push(info), platform);
  // Native XUL children are connected when the containing portal is appended.
  for (const browser of browsers) browser.isConnected = true;
  const oldAppend = adapter.portal.append.bind(adapter.portal);
  adapter.portal.append = child => { oldAppend(child); child.isConnected = true; };
  adapter.setVisible(true);
  return { adapter, browsers, loads, states };
}

test('Notion refresh restores a remote browser whose content process has disappeared', async () => {
  const f = setup();
  try {
    await f.adapter.load('https://www.notion.so/0123456789abcdef0123456789abcdef');
    const original = f.adapter.browser;
    original.frameLoader.remoteTab = null;
    await assert.doesNotReject(async () => f.adapter.load('https://www.notion.so/0123456789abcdef0123456789abcdef'));
    assert.notEqual(f.adapter.browser, original);
    assert.equal(original.isConnected, false);
    assert.equal(f.loads.length, 2);
    assert.equal(f.loads[1].browser, f.adapter.browser);
  } finally { f.adapter.destroy(); }
});

test('Notion navigation waits for the remote actor instead of using an incomplete frame loader', async () => {
  const f = setup();
  try {
    f.adapter.browser.setAttribute('remote', 'true');
    f.adapter.browser.frameLoader.remoteTab = null;
    const pending = Promise.resolve().then(() => f.adapter.load('https://www.notion.so/0123456789abcdef0123456789abcdef'));
    const ready = setTimeout(() => { f.adapter.browser.frameLoader.remoteTab = {}; }, 25);
    try { await assert.doesNotReject(pending); } finally { clearTimeout(ready); }
    assert.equal(f.loads.length, 1);
    assert.equal(f.states.at(-1).loading, false);
  } finally { f.adapter.destroy(); }
});
