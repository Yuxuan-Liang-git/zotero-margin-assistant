const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = path.resolve(__dirname, '../src/memory-core.js');
const M = fs.existsSync(modulePath) ? require(modulePath) : {};

function state(text, summary = '') {
  return {
    conversations: [{ id: 'discussion', title: '条件讨论', updatedAt: 1700000000000,
      draft: '未发送的秘密草稿', history: [
        { role: 'user', content: '如何理解激励条件？', materials: [] },
        { role: 'assistant', content: text, materials: [], incomplete: false }
      ] }],
    readingSummary: { text: summary, updatedAt: 1700000001000, pendingText: '待发布的秘密摘要' }
  };
}
const scope = key => ({ libraryID: 1, attachmentKey: key });
const document = (key, title, text, summary = '', options = {}) =>
  M.buildDocument(scope(key), state(text, summary), { title, year: '2025', doi: '10.1/example' }, options);

test('paper sources survive cleaning and portable transfer with distinct provenance', () => {
  const sources = ['metadata', 'pdf', 'note', 'annotation'].map((kind, i) => ({
    version: 2, label: '阅读' + (i + 1), libraryID: 1, paperKey: 'PAPER001', sourceKey: 'SOURCE01',
    attachmentKey: kind === 'metadata' || kind === 'note' ? '' : 'PDF00001', title: 'Observer', year: '2025', doi: '',
    kind, conversationId: '', messageIndex: 0, part: 0, signature: M.signature('source ' + i),
    fingerprint: '1111111122222222', updatedAt: 0, text: 'source ' + i, ...(kind === 'pdf' ? { pageIndex: 42 } : {})
  }));
  assert.deepEqual(M.cleanSources(sources), sources);
  assert.throws(() => M.cleanSources([{ ...sources[1], pageIndex: -1 }]), /来源/);
  assert.throws(() => M.cleanSources([{ ...sources[0], paperKey: '../oops' }]), /来源/);
  assert.throws(() => M.cleanSources([{ ...sources[2], sourceKey: 'bad' }]), /来源/);
  const text = M.annotatedText('answer', sources);
  for (const label of ['文献摘要', '论文正文', 'Zotero笔记', 'PDF标注']) assert.ok(text.includes(label));
  const T = require('../src/transfer.js');
  const C = require('../src/core.js');
  const conversation = C.emptyState().conversations[0];
  conversation.history = [{ role: 'user', content: 'question', materials: [] }, { role: 'assistant', content: 'answer', materials: [], memorySources: sources }];
  assert.deepEqual(T.prepare(T.parseJSON(T.exportJSON(conversation))[0]).history[1].memorySources, sources);
});

test('combined sources count parent papers and deduplicate repeated text across kinds', () => {
  const sources = Array.from({ length: 10 }, (_, i) => ({
    version: 2, label: '阅读' + (i + 1), libraryID: 1, paperKey: 'PAPER00' + Math.floor(i / 2), sourceKey: 'SOURCE0' + i,
    attachmentKey: i % 2 ? '' : 'PDF0000' + i, title: 'Observer ' + i, year: '', doi: '', kind: i % 2 ? 'note' : 'pdf',
    conversationId: '', messageIndex: 0, part: 0, signature: M.signature('observer excitation ' + i),
    fingerprint: '1111111122222222', updatedAt: 0, text: 'observer excitation ' + i
  }));
  sources[1].text = sources[0].text;
  const selected = M.mergeSources(sources, 'observer excitation');
  assert.ok(selected.length > 0);
  assert.ok(new Set(selected.map(s => s.paperKey)).size <= 3);
  assert.equal(new Set(selected.map(s => s.text)).size, selected.length);
  assert.equal(M.cleanSources(selected).length, selected.length);
});

test('named-paper metadata cannot crowd out directly relevant existing dialogue', async () => {
  const doc = await document('BBBB1111', 'Research Memory B excitation QA', '缓存激励条件要求信息矩阵正定。', '# 文章内容\n\n缓存激励条件与参数辨识相关。');
  const query = 'Research Memory B excitation QA 的缓存激励条件与当前论文有什么联系';
  const previous = M.selectSources([doc], query).map(source => ({ ...source, paperKey: 'PAPER001' }));
  const metadata = { version: 2, label: '阅读1', libraryID: 1, paperKey: 'PAPER001', sourceKey: 'PAPER001', attachmentKey: '', title: doc.title, year: '', doi: '', kind: 'metadata', conversationId: '', messageIndex: 0, part: 0, signature: M.signature(doc.title), fingerprint: '1111111122222222', updatedAt: 0, text: doc.title };
  const result = M.mergeSources([...previous, metadata], query);
  assert.ok(result.some(source => source.kind === 'dialogue'));
});

test('old conversations from two PDF versions keep their own attachment identities after paper grouping', async () => {
  const a = await document('PDF00001', 'Shared paper', '版本一的激励条件说明。');
  const b = await document('PDF00002', 'Shared paper', '版本二补充激励条件的限制。');
  const sources = [...M.selectSources([a], '激励条件'), ...M.selectSources([b], '激励条件')].map(source => ({ ...source, paperKey: 'PAPER001' }));
  const merged = M.mergeSources(sources, '激励条件');
  assert.deepEqual(new Set(merged.map(source => source.attachmentKey)), new Set(['PDF00001', 'PDF00002']));
});

test('memory extracts completed dialogue and formal summary with identifiable provenance', async () => {
  const doc = await document('BBBB1111', 'Persistent Excitation', '信息矩阵满秩时参数可辨识。', '# 文章内容\n\n持续激励保证信息矩阵正定。');
  assert.ok(doc.chunks.some(c => c.kind === 'summary'));
  const dialogue = doc.chunks.find(c => c.kind === 'dialogue');
  assert.equal(dialogue.conversationId, 'discussion');
  assert.equal(dialogue.messageIndex, 1);
  assert.match(dialogue.text, /用户问题.*激励条件/s);
  assert.doesNotMatch(JSON.stringify(doc), /秘密/);
  const incomplete = state('未完成的回答');
  incomplete.conversations[0].history[1].incomplete = true;
  assert.equal((await M.buildDocument(scope('BBBB1111'), incomplete, { title: 'B' })).chunks.length, 0);
});

test('local ranking finds Chinese and English topics and leaves unrelated papers out', async () => {
  const relevant = await document('BBBB1111', 'Persistent Excitation', '持续激励与参数可辨识性相关，信息矩阵必须满足正定条件。');
  const unrelated = await document('CCCC1111', 'Cell migration', '细胞迁移涉及细胞骨架和膜蛋白的重排。');
  const ranked = M.rankDocuments([relevant, unrelated], 'persistent excitation 可辨识性');
  assert.equal(ranked[0].attachmentKey, 'BBBB1111');
  assert.equal(ranked.some(d => d.attachmentKey === 'CCCC1111'), false);
  assert.equal(M.rankDocuments([relevant, unrelated], '量子纠缠 superconducting qubits').length, 0);
});

test('an explicitly named paper can be found using its title or DOI', async () => {
  const doc = await document('BBBB1111', 'Linear Observer Design', '观测器设计需要检查误差动力学。');
  assert.equal(M.rankDocuments([doc], '请联系 Linear Observer Design 的结论')[0].attachmentKey, 'BBBB1111');
  assert.equal(M.rankDocuments([doc], '10.1/example')[0].attachmentKey, 'BBBB1111');
});

test('retrieval excludes the current conversation and separates libraries', async () => {
  const doc = await document('BBBB1111', '激励条件', '持续激励保证参数收敛。');
  assert.equal(M.selectSources([doc], '持续激励', { scope: scope('BBBB1111'), conversationId: 'discussion' }).length, 0);
  assert.equal(M.selectSources([{ ...doc, libraryID: 2 }], '持续激励', { scope: scope('AAAA1111') }).length, 0);
  assert.equal(M.selectSources([doc], '持续激励', { scope: scope('AAAA1111') })[0].attachmentKey, 'BBBB1111');
});

test('memory sources obey paper, fragment and total budgets without duplicates', async () => {
  const docs = await Promise.all(['BBBB1111', 'CCCC1111', 'DDDD1111', 'EEEE1111'].map((key, index) =>
    document(key, '激励研究 ' + index, '持续激励和信息矩阵。'.repeat(280))));
  const sources = M.selectSources(docs, '持续激励信息矩阵', { scope: scope('AAAA1111') });
  assert.ok(new Set(sources.map(s => s.attachmentKey)).size <= 3);
  assert.ok(sources.every(s => s.text.length <= 1800));
  assert.ok(sources.reduce((n, s) => n + s.text.length, 0) <= 6000);
  assert.equal(new Set(sources.map(s => s.signature + s.text)).size, sources.length);
});

test('formula blocks remain complete and large index builds yield and honor cancellation', async () => {
  const formula = '\\[\n\\begin{aligned}\ny &= Hu + e \\\\\nJ &= \\mathbb{E}[\\psi\\psi^T]\n\\end{aligned}\n\\]';
  const doc = await document('BBBB1111', '激励公式', '解释条件。\n\n' + formula + '\n\n信息矩阵需要正定。');
  assert.ok(doc.chunks.some(c => c.text.includes(formula)));
  let yielded = 0;
  const large = state('持续激励与可辨识性。'.repeat(500));
  large.conversations[0].history = Array.from({ length: 100 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: '激励问题' + i + '\n\n' + '持续激励。'.repeat(200), incomplete: false }));
  await M.buildDocument(scope('BBBB1111'), large, { title: '长历史' }, { yieldControl: async () => { yielded++; } });
  assert.ok(yielded >= 2);
  const controller = new AbortController();
  await assert.rejects(M.buildDocument(scope('BBBB1111'), large, { title: '取消' }, {
    signal: controller.signal, yieldControl: async () => { controller.abort(); }
  }), /取消|停止/);
});

test('request context uses only the remaining budget and treats old messages as source material', async () => {
  const doc = await document('BBBB1111', '激励条件', '持续激励保证信息矩阵正定。');
  const sources = M.selectSources([doc], '持续激励', { scope: scope('AAAA1111') });
  const messages = [{ role: 'system', content: '原有来源约束' }, { role: 'user', content: '当前问题' }];
  const result = M.appendContext(messages, sources, 1800);
  assert.ok(result.sources.length > 0);
  assert.ok(result.messages.reduce((n, m) => n + m.content.length, 0) - messages.reduce((n, m) => n + m.content.length, 0) <= 1800);
  assert.match(result.messages[0].content, /原有来源约束/);
  assert.match(JSON.stringify(result.messages), /历史.*资料|研究记忆/);
  assert.deepEqual(M.appendContext(messages, sources, 20).sources, []);
  assert.deepEqual(M.appendContext(messages, sources, 6000, 100).sources, []);
  assert.equal(messages.length, 2);
});

test('source validation rejects unsafe targets and persists through existing message cleaning', async () => {
  const doc = await document('BBBB1111', '激励条件', '持续激励保证可辨识性。');
  const sources = M.selectSources([doc], '持续激励', { scope: scope('AAAA1111') });
  assert.throws(() => M.cleanSources([{ ...sources[0], attachmentKey: '../../private' }]), /来源/);
  assert.equal(M.sourceCurrent({ ...sources[0], text: '伪造的历史结论' }, state('持续激励保证可辨识性。')), false);
  const C = require('../src/core.js');
  const saved = C.emptyState();
  saved.conversations[0].history = [{ role: 'assistant', content: '关联解释[阅读1]', materials: [], memorySources: sources }];
  assert.deepEqual(C.cleanState(saved).conversations[0].history[0].memorySources, sources);
});

test('formal summaries export as standalone notes with metadata and original LaTeX', async () => {
  const doc = await document('BBBB1111', '激励条件', '历史聊天正文', '# 文章内容\n\n定义 \\(J\\)。\n\n# 关键公式解释\n\n\\[J>0\\]');
  const md = M.exportNotes([doc]);
  assert.match(md, /激励条件/);
  assert.match(md, /10\.1\/example/);
  assert.match(md, /\\\[J>0\\\]/);
  assert.doesNotMatch(md, /历史聊天正文|秘密/);
});

test('portable conversations keep memory provenance in JSON and readable excerpts in Markdown', async () => {
  const C = require('../src/core.js');
  const T = require('../src/transfer.js');
  const doc = await document('BBBB1111', 'B论文', '持续激励使信息矩阵正定。');
  const memorySources = M.selectSources([doc], '持续激励', { scope: scope('AAAA1111') });
  const conversation = C.emptyState().conversations[0];
  conversation.history = [{ role: 'user', content: '请比较两篇论文', materials: [] }, { role: 'assistant', content: '相关结论[阅读1]。', memorySources, materials: [] }];
  const encoded = T.exportJSON(conversation);
  const imported = T.prepare(T.parseJSON(encoded)[0]);
  assert.deepEqual(imported.history[1].memorySources, memorySources);
  assert.match(T.exportMarkdown(conversation), /持续激励使信息矩阵正定/);
});

test('many unclosed formula delimiters cannot block the index builder', async () => {
  let maximum = 0;
  let previous = performance.now();
  const timer = setInterval(() => { const now = performance.now(); maximum = Math.max(maximum, now - previous); previous = now; }, 5);
  try {
    const doc = await document('BBBB1111', '不完整公式历史', '\\[未闭合公式\n'.repeat(20000));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(doc.chunks.length > 0);
    assert.ok(maximum < 180, 'heartbeat delay ' + maximum + ' ms');
  } finally { clearInterval(timer); }
});

test('CRLF formulas, escaped line spacing and fenced source remain intact', async () => {
  const formula = '\\[\r\n\\begin{aligned}\r\na &= b\\\\[4pt]\r\nc &= d\r\n\\end{aligned}\r\n\\]';
  const code = '```tex\r\nliteral \\\\[4pt] \\\\[source\r\n```';
  const doc = await document('BBBB1111', '公式分段', code + '\r\n\r\n' + formula);
  assert.ok(doc.chunks.some(chunk => chunk.text.includes(formula)));
  assert.ok(doc.chunks.some(chunk => chunk.text.includes(code)));
});
