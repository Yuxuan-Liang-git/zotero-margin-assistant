const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const V = fs.existsSync(require.resolve('../src/memory-core.js').replace('memory-core', 'vector-core')) ? require('../src/vector-core.js') : {};
const M = require('../src/memory-core.js');
const source = (i, text = 'The information matrix must have full rank.') => ({ version: 2, label: '阅读1', libraryID: 1,
  paperKey: 'PAPER00' + i, sourceKey: 'SOURCE0' + i, attachmentKey: 'PDF0000' + i, title: 'Observer ' + i,
  year: '2025', doi: '', kind: 'pdf', conversationId: '', messageIndex: 0, part: 0,
  signature: M.signature(text), fingerprint: '1111111122222222', updatedAt: 0, text, pageIndex: 42 });

test('float32 encoding normalizes finite vectors with deterministic little endian bytes', () => {
  assert.equal(typeof V.pack, 'function');
  assert.deepEqual(V.pack([2, 0]), { encoded: 'AACAPwAAAAA=', compact: 'fwA=', norm: 127, dimensions: 2 });
  assert.deepEqual([...V.unpack('AACAPwAAAAA=', 2)], [1, 0]);
  assert.equal(V.cosine([1, 0], [1, 0]), 1);
  assert.equal(V.cosine([1, 0], [0, 1]), 0);
  assert.equal(V.cosine([1, 0], [-1, 0]), -1);
  assert.ok(Math.abs(V.cosine([3, 4], [0, 2]) - 0.8) < 1e-7);
  assert.ok(Math.abs(V.cosine([1e308, 1e308], [1, 1]) - 1) < 1e-7);
});

test('codec rejects malformed, nonfinite, mismatched and zero norm inputs', () => {
  assert.equal(typeof V.pack, 'function');
  for (const v of [[], [0, 0], [NaN, 1], [Infinity, 1]]) assert.throws(() => V.pack(v));
  for (const [s, d] of [['%%%%', 2], ['AAAA', 2], ['AAAAAAAAAAA=', 2], ['AACAfwAAAAA=', 2], ['AACAPwAAAAA=', 3], ['AACAPwAAAAA=', 0], ['AACAPwAAAAA=\n', 2]]) assert.throws(() => V.unpack(s, d));
  assert.throws(() => V.cosine([1, 0], [1]));
  assert.throws(() => V.cosine([1, 0], [0, 0]));
});

test('int8 encoding preserves separated positive ordering against float32 without altering floats', () => {
  assert.equal(typeof V.pack, 'function');
  const input = [[1, 0.1], [0.8, 0.5], [0.2, 1]];
  const packed = input.map(v => V.pack(v));
  const approximate = packed.map(p => { const bytes = Buffer.from(p.compact, 'base64'); return bytes.readInt8(0) / p.norm; });
  assert.ok(approximate[0] > approximate[1] && approximate[1] > approximate[2]);
  const exact = packed.map(p => V.cosine([1, 0], V.unpack(p.encoded, 2)));
  assert.ok(exact[0] > exact[1] && exact[1] > exact[2]);
  assert.deepEqual(input, [[1, 0.1], [0.8, 0.5], [0.2, 1]]);
});

test('dense only cross language match retains provenance through final request context', () => {
  assert.equal(typeof V.hybridSelect, 'function');
  const result = V.hybridSelect([{ source: source(1), denseRank: 1, score: 0.92 }], '持续激励条件');
  assert.equal(result.length, 1);
  assert.equal(result[0].pageIndex, 42);
  assert.equal(result[0].attachmentKey, 'PDF00001');
  assert.equal(result[0].label, '阅读1');
  assert.deepEqual(M.cleanSources(result), result);
  assert.match(M.appendContext([{ role: 'user', content: '持续激励条件' }], result).messages[0].content, /information matrix/);
  assert.deepEqual(V.hybridSelect([], '无关问题'), []);
  assert.deepEqual(V.hybridSelect([{ source: source(1), score: -0.1 }], '无关问题'), []);
});

test('hybrid selection deduplicates anchors and text, applies paper and fragment budgets', () => {
  assert.equal(typeof V.hybridSelect, 'function');
  const candidates = Array.from({ length: 6 }, (_, i) => ({ source: source(i, String(i).repeat(1700)), denseRank: i + 1 }));
  candidates.splice(1, 0, { source: { ...source(0, 'replacement'), signature: M.signature('replacement') }, sparseRank: 2 });
  candidates.push({ source: { ...source(1, '0'.repeat(1700)), part: 1 }, sparseRank: 1 });
  const selected = V.hybridSelect(candidates, '无共同词');
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected.map(s => s.paperKey)).size, 3);
  assert.equal(new Set(selected.map(s => s.text)).size, 3);
  assert.ok(selected.reduce((n, s) => n + s.text.length, 0) <= 6000);
  assert.deepEqual(selected.map(s => s.label), ['阅读1', '阅读2', '阅读3']);
  assert.deepEqual(M.cleanSources(selected), selected);
  assert.deepEqual(V.hybridSelect([{ source: source(0, 'x'.repeat(1801)), denseRank: 1 }], ''), []);
});

test('anchor identifies origin rather than mutable content and excludes active dialogue only', () => {
  assert.equal(typeof V.anchorKey, 'function');
  const a = source(1), b = { ...a, text: 'changed', signature: M.signature('changed'), fingerprint: '2222222233333333' };
  assert.equal(V.anchorKey(a), V.anchorKey(b));
  assert.notEqual(a.signature, b.signature);
  for (const patch of [{ libraryID: 2 }, { attachmentKey: 'PDF00002' }, { sourceKey: 'SOURCE02' }, { kind: 'annotation' }, { conversationId: 'other' }, { messageIndex: 2 }, { part: 1 }]) assert.notEqual(V.anchorKey(a), V.anchorKey({ ...a, ...patch }));
  const dialogue = { ...a, version: 1, kind: 'dialogue', conversationId: 'active' };
  const result = V.hybridSelect([{ source: dialogue, denseRank: 1 }, { source: a, denseRank: 2 }, { source: { ...source(2), libraryID: 2 }, denseRank: 3 }], '', { scope: { libraryID: 1, attachmentKey: 'PDF00001' }, conversationId: 'active' });
  assert.deepEqual(result.map(s => s.kind), ['pdf']);
});

test('compact vectors stay nonzero for diffuse high-dimensional inputs and preserve sign symmetry', () => {
  const packed = V.pack(Array(65536).fill(1));
  assert.ok(packed.norm > 0);
  assert.equal(Buffer.from(packed.compact, 'base64').readInt8(0), 127);
  const positive = V.pack([200, 1]), negative = V.pack([-200, -1]);
  assert.equal(Buffer.from(positive.compact, 'base64').readInt8(1), 1);
  assert.equal(Buffer.from(negative.compact, 'base64').readInt8(1), -1);
});
