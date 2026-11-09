const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const project = path.resolve(__dirname, '..');

async function setup(library = false) {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  try {
  if (library) {
    const db = new (require('node:sqlite').DatabaseSync)(':memory:');
    await page.exposeFunction('librarySQL', (sql, params = []) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') { db.exec(sql); return []; }
      const statement = db.prepare(sql);
      if (/^\s*(SELECT|PRAGMA)/i.test(sql)) return statement.all(...params);
      statement.run(...params); return [];
    });
    browser.on('disconnected', () => db.close());
  }
  await page.setContent('<style>body{margin:0}#split-view{position:fixed;inset:40px 0 0}</style><div id="split-view">A论文</div><iframe id="paper-b" style="position:fixed;left:0;top:0;width:800px;height:900px;visibility:hidden"></iframe>');
  for (const name of ['web', 'instructions', 'notion', 'docks', 'reading-summary', 'memory-core', 'core', 'memory-store', 'library-index', 'library-store', 'library-host', 'memory-host', 'transfer', 'capture', 'references', 'deepseek', 'settings', 'attachments', 'clipboard', 'panel', 'host']) {
    const file = path.join(project, 'src', name + '.js');
    if (fs.existsSync(file)) await page.addScriptTag({ path: file });
  }
  await page.evaluate(async css => {
    const files = new Map();
    const preferences = new Map();
    const fields = title => ({ getField: name => name === 'title' ? title : name === 'date' ? '2025' : '' });
    const a = { id: 1, key: 'AAAA1111', libraryID: 1, parentID: 10, isPDFAttachment: () => true, getFilePathAsync: async () => '/pdf/A/paper.pdf', isEditable: () => true };
    const b = { ...a, id: 2, key: 'BBBB1111', parentID: 20, getFilePathAsync: async () => '/pdf/B/paper.pdf' };
    const items = new Map([[1, a], [2, b], [10, fields('A论文的可辨识性')], [20, fields('B研究与持续激励')]]);
    const old = ZMACore.emptyState();
    old.conversations[0].id = 'b-reading'; old.activeConversationId = 'b-reading';
    old.conversations[0].title = 'B中的条件讨论';
    old.conversations[0].history = [{ role: 'user', content: '持续激励有什么作用？', materials: [] }, { role: 'assistant', content: 'B中的既有结论是信息矩阵正定时参数可辨识。公式为 \\[J>0\\]。', materials: [] }];
    old.readingSummary = ZMAReadingSummary.clean({ text: '# 文章内容\n\nB摘要讨论持续激励。\n\n# 关键公式解释\n\n\\[J>0\\]', updatedAt: 1700000000000 });
    files.set('/pdf/B/margin-comments-assistant-1-BBBB1111.json', JSON.stringify(old));
    const frame = document.querySelector('#paper-b');
    const reader = { itemID: 1, type: 'pdf', _iframeWindow: window };
    const other = { itemID: 2, type: 'pdf', _iframeWindow: frame.contentWindow };
    const Z = { DataDirectory: { dir: '/data' }, File: { getContentsFromURL: () => css },
      Prefs: { get: key => preferences.get(key), set: (key, value) => preferences.set(key, value) }, Libraries: { userLibraryID: 1 },
      Search: class { addCondition() {} async search() { return [1, 2]; } },
      Items: { get: id => items.get(id), getAsync: async ids => ids.map(id => items.get(id)), getByLibraryAndKey: (libraryID, key) => [...items.values()].find(item => item.libraryID === libraryID && item.key === key) },
      Reader: { _readers: [reader, other], open: async (id, location) => { globalThis.openedPDF = id; globalThis.openedLocation = location; frame.style.visibility = 'visible'; return id === 2 ? other : reader; } }
    };
    if (globalThis.librarySQL) {
      Z.DBConnection = class {
        queryAsync(sql, params) { return librarySQL(sql, params); }
        async executeTransaction(action) { await librarySQL('BEGIN'); try { const result = await action(); await librarySQL('COMMIT'); return result; } catch (error) { await librarySQL('ROLLBACK'); throw error; } }
        async closeDatabase() {}
      };
      for (const [id, item] of items) if (id >= 10) Object.assign(item, { id, key: id === 10 ? 'PAPERA01' : 'PAPERB01', libraryID: 1, isRegularItem: () => true, getAttachments: () => [id === 10 ? 1 : 2], getNotes: () => [] });
      items.set(30, { id: 30, key: 'META0001', libraryID: 1, isRegularItem: () => true, getField: name => name === 'title' ? 'Metadata evidence' : name === 'abstractNote' ? 'Standaloneabstract identifiability condition.' : '', getNotes: () => [], getAttachments: () => [] });
      Z.Items.getAll = async () => [...items.keys()];
      Z.SDT = { getPack: async () => ({ ok: true }), getReader: async () => ({ getCatalog: async () => ({ pages: [{}, {}] }), getPageBlocks: async pageIndex => [{ content: [{ text: pageIndex ? 'Unreaddocumentneedle guarantees excitation.' : 'Opening page.' }] }] }) };
      files.set('/pdf/A/paper.pdf', 'fixture PDF A'); files.set('/pdf/B/paper.pdf', 'fixture PDF B');
      files.delete('/pdf/B/margin-comments-assistant-1-BBBB1111.json');
      window.ZoteroPane = { selectItem: async id => { globalThis.openedItem = id; } }; Z.getMainWindow = () => window;
    }
    const IO = { exists: async file => files.has(file), stat: async file => ({ size: new TextEncoder().encode(files.get(file) || '').length, lastModified: files.get(file)?.length || 0 }),
      readUTF8: async file => files.get(file), makeDirectory: async () => {}, writeUTF8: async (file, text) => { files.set(file, text); } };
    const host = new ZMAHost.Host({ bridge: { renderMathPreview: (node, text) => node.textContent = text, installMathResources: () => () => {} },
      controller: { ensureSession: async reader => ({ reader, cardRuntimes: () => [], adapter: { document: () => reader._iframeWindow.document } }) } }, {
      Zotero: Z, IOUtils: IO, PathUtils: { join: (...parts) => parts.join('/'), parent: file => file.slice(0, file.lastIndexOf('/')) }, window,
      chooseConversationFile: async () => '/export/research.md'
    });
    host.running = true;
    host.copy = text => { globalThis.copied = text; };
    host.documentContext = async () => ({ mode: 'full-text', title: 'A论文', totalPages: 1, pages: [1], text: 'A论文研究当前参数模型。' });
    globalThis.requests = [];
    host.client.generate = async (messages, options) => { requests.push(messages); options.onDelta?.('与先前阅读有关[阅读1]。'); return '与先前阅读有关[阅读1]。'; };
    globalThis.fixture = { host, reader, other, files, preferences, old, items };
    await host.memory.rebuild(1);
    globalThis.panel = await host.panel(reader);
    panel.showChat();
  }, fs.readFileSync(path.join(project, 'src/assistant.css'), 'utf8'));
    return { browser, page };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

test('the normal send path retrieves B for A and reopens the cited conversation without losing A draft', async () => {
  const { browser, page } = await setup();
  try {
    await page.getByRole('textbox', { name: '问题', exact: true }).fill('持续激励与当前论文有什么联系？');
    await page.evaluate(() => panel.send());
    assert.match(await page.evaluate(() => JSON.stringify(requests)), /B中的既有结论|B摘要/);
    assert.equal(await page.evaluate(() => requests.length), 1);
    assert.ok(await page.locator('.zma-memory-sources').count() > 0);
    await page.getByRole('textbox', { name: '问题', exact: true }).fill('保留A的后续草稿');
    const cite = page.locator('.zma-memory-cite').first();
    assert.equal(await cite.count(), 1);
    await cite.click();
    await page.waitForFunction(() => globalThis.openedPDF === 2);
    assert.equal(await page.getByRole('textbox', { name: '问题', exact: true }).inputValue(), '保留A的后续草稿');
    const restored = await page.evaluate(async () => {
      const state = await fixture.host.load(fixture.reader);
      const saved = ZMACore.cleanState(state).conversations[0].history.at(-1);
      const target = fixture.host.panels.get(fixture.other);
      return { sources: saved.memorySources.length, view: target.activeView, conversation: target.conversationId };
    });
    assert.ok(restored.sources > 0);
    const folder = path.join(project, 'evidence/library-0180');
    fs.mkdirSync(folder, { recursive: true });
    await page.screenshot({ path: path.join(folder, 'memory-sources.png') });
  } finally { await browser.close(); }
});

test('unread personal-library PDFs and metadata reach normal requests with navigable compact sources', async () => {
  const { browser, page } = await setup(true);
  try {
    await page.evaluate(async () => { panel.question.value = 'Unreaddocumentneedle'; await panel.send(); });
    assert.match(await page.evaluate(() => JSON.stringify(requests)), /Unreaddocumentneedle guarantees excitation/);
    assert.equal(await page.evaluate(() => fixture.files.has('/pdf/B/margin-comments-assistant-1-BBBB1111.json')), false);
    await page.locator('.zma-memory-cite').first().click();
    assert.equal(await page.evaluate(() => openedPDF), 2);
    assert.equal(await page.evaluate(() => openedLocation.pageIndex), 1);
    await page.locator('.zma-memory-sources summary').first().click();
    assert.match(await page.locator('.zma-memory-source').first().textContent(), /论文正文.*第2页/s);
    await page.screenshot({ path: path.join(project, 'evidence/library-0180/library-sources.png') });
    const template = fs.readFileSync(path.join(project, 'content/deepseek-settings.inc.xhtml'), 'utf8').replace(/html:/g, '');
    await page.evaluate(html => { const root = document.createElement('section'); root.id = 'library-settings'; root.style.cssText = 'position:relative;z-index:20000;background:white'; root.innerHTML = html; document.body.append(root); ZMASettings.bind(root.querySelector('#zma-api-settings'), fixture.host.settingsAPI()); }, template);
    assert.match(await page.locator('#zma-memory-status').textContent(), /个人文献库.*3篇.*元数据.*3/s);
    await page.locator('#zma-memory-pause').click();
    await page.waitForFunction(() => fixture.preferences.get('margincomments.researchMemoryPaused') === true);
    await page.evaluate(() => { document.querySelector('#library-settings').hidden = true; });
    await page.evaluate(async () => { fixture.host.claimRequest(fixture.reader); fixture.host.releaseRequest(fixture.reader); await panel.newConversation(); panel.question.value = 'Standaloneabstract'; await panel.send(); });
    assert.equal(await page.evaluate(() => fixture.host.memory.settingsAPI().state().paused), true);
    assert.match(await page.evaluate(() => JSON.stringify(requests.at(-1))), /Standaloneabstract identifiability/);
    await page.locator('.zma-memory-cite').first().click();
    assert.equal(await page.evaluate(() => openedItem), 30);
    await page.evaluate(() => { document.querySelector('#library-settings').hidden = false; });
    await page.locator('#zma-memory-export').click(); await page.waitForFunction(() => fixture.files.has('/export/research.md'));
    assert.match(await page.evaluate(() => fixture.files.get('/export/research.md')), /文献资料.*Metadata evidence/s);
    await page.screenshot({ path: path.join(project, 'evidence/library-0180/library-settings.png') });
    await page.evaluate(() => fixture.host.memory.stop());
  } finally { await browser.close(); }
});

test('disabled memory and stale source files leave the normal PDF question usable', async () => {
  const { browser, page } = await setup();
  try {
    await page.evaluate(async () => { await fixture.host.memory.settingsAPI().set(false); panel.question.value = '持续激励'; await panel.send(); });
    assert.doesNotMatch(await page.evaluate(() => JSON.stringify(requests[0])), /B中的既有结论|B摘要/);
    await page.evaluate(async () => {
      await panel.newConversation();
      await fixture.host.memory.settingsAPI().set(true);
      fixture.files.delete('/pdf/B/margin-comments-assistant-1-BBBB1111.json');
      panel.question.value = '持续激励'; await panel.send();
    });
    assert.equal(await page.evaluate(() => requests.length), 2);
    assert.equal(await page.locator('.zma-memory-cite').count(), 0);
    assert.equal(await page.locator('.zma-memory-sources').count(), 0);
  } finally { await browser.close(); }
});

test('settings expose persisted memory control, index status and standalone Markdown export', async () => {
  const { browser, page } = await setup();
  try {
    const template = fs.readFileSync(path.join(project, 'content/deepseek-settings.inc.xhtml'), 'utf8').replace(/html:/g, '');
    await page.evaluate(html => { const root = document.createElement('section'); root.style.cssText='position:relative;z-index:20000;background:white';root.innerHTML = html; document.body.append(root); ZMASettings.bind(root.querySelector('#zma-api-settings'), fixture.host.settingsAPI()); }, template);
    assert.equal(await page.locator('#zma-memory-enabled').count(), 1);
    assert.match(await page.locator('#zma-memory-status').textContent(), /1.*篇/);
    await page.locator('#zma-memory-export').click();
    await page.waitForFunction(() => fixture.files.has('/export/research.md'));
    const text = await page.evaluate(() => fixture.files.get('/export/research.md'));
    assert.match(text, /B摘要/);
    assert.match(text, /\\\[J>0\\\]/);
    assert.doesNotMatch(text, /B中的既有结论/);
    await page.locator('#zma-memory-enabled').uncheck();
    assert.equal(await page.evaluate(() => fixture.preferences.get('margincomments.researchMemory')), false);
    assert.equal(await page.evaluate(() => requests.length), 0);
  } finally { await browser.close(); }
});

test('source navigation to an early message renders a bounded window in long history', async () => {
  const { browser, page } = await setup();
  try {
    const result = await page.evaluate(async () => {
      const long = ZMACore.cleanState(fixture.old);
      const conversation = long.conversations[0];
      for (let i = 0; i < 180; i++) conversation.history.push({ role: i % 2 ? 'assistant' : 'user', content: '后续讨论 ' + i, materials: [] });
      fixture.files.set('/pdf/B/margin-comments-assistant-1-BBBB1111.json', JSON.stringify(long));
      const doc = await ZMAMemoryCore.buildDocument({ libraryID: 1, attachmentKey: 'BBBB1111' }, long, { title: 'B研究与持续激励' });
      const chunk = doc.chunks.find(chunk => chunk.kind === 'dialogue' && chunk.messageIndex === 1);
      const source = { ...chunk, libraryID: 1, attachmentKey: 'BBBB1111', title: doc.title, year: '', doi: '', label: '阅读1' };
      await fixture.host.memory.openSource(source);
      const target = fixture.host.panels.get(fixture.other);
      return { count: target.messages.querySelectorAll('.zma-message').length, found: !!target.messages.querySelector('[data-message-index="1"]') };
    });
    assert.equal(result.found, true);
    assert.ok(result.count <= 12, JSON.stringify(result));
  } finally { await browser.close(); }
});

test('an old citation opens visible feedback when its authoritative record has changed', async () => {
  const { browser, page } = await setup();
  try {
    await page.evaluate(async () => { panel.question.value = '持续激励'; await panel.send(); fixture.files.delete('/pdf/B/margin-comments-assistant-1-BBBB1111.json'); });
    await page.locator('.zma-memory-cite').first().click();
    await page.waitForFunction(() => document.querySelector('.zma-memory-status')?.textContent.includes('已变更'));
    assert.equal(await page.locator('.zma-memory-sources').getAttribute('open'), '');
    assert.equal(await page.locator('.zma-memory-status').isVisible(), true);
    assert.equal(await page.evaluate(() => requests.length), 1);
  } finally { await browser.close(); }
});
