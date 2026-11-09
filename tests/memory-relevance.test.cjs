const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/memory-core.js');
const S = require('../src/reading-summary.js');

async function paper(question, answer = 'Actuator dynamics are shaped to match the simulated robot.') {
  const state = { conversations: [{ id: 'default', updatedAt: 1, history: [
    { role: 'user', content: question }, { role: 'assistant', content: answer, incomplete: false }
  ] }] };
  return M.buildDocument({ libraryID: 1, attachmentKey: 'OTHER001' }, state,
    { title: 'Actuator Reality Shaping for Zero-Shot Sim-to-Real Robot Learning' });
}

test('generic paper overview questions cannot retrieve other papers by matching old question wording', async () => {
  for (const question of ['这篇论文讲了啥？', '这篇文章主要讲了什么？', '请帮我总结一下这篇论文',
    'What is this paper about?', 'Explain this paper', 'Summarize this paper in Chinese', 'What are the key contributions of this article?']) {
    const doc = await paper(question);
    assert.deepEqual(M.selectSources([doc], question), [], question);
  }
});

test('local symbol and equation follow-ups do not search other papers using conversational filler', async () => {
  for (const question of ['那G是啥？', '这是什么意思？', '解释一下式 (16)', '解释公式 (16)', 'Explain Eq. (16)', '公式 (16) 是什么意思？', '公式 (16) 中的符号是什么意思？', 'What does G mean?', '这个图怎么理解？']) {
    const doc = await paper(question);
    assert.deepEqual(M.selectSources([doc], question), [], question);
  }
});

test('specific scientific topics and explicitly named papers remain retrievable', async () => {
  const other = await paper('这篇论文讲了啥？');
  const relevant = await M.buildDocument({ libraryID: 1, attachmentKey: 'TOPIC001' },
    { conversations: [{ id: 'topic', updatedAt: 2, history: [
      { role: 'user', content: 'persistent excitation 是什么？' },
      { role: 'assistant', content: 'Persistent excitation ensures a positive-definite information matrix and parameter identifiability.', incomplete: false }
    ] }] }, { title: 'Identifiability and excitation' });
  const sources = M.selectSources([other, relevant], '请解释 persistent excitation 与可辨识性的关系');
  assert.deepEqual([...new Set(sources.map(s => s.attachmentKey))], ['TOPIC001']);
  const named = M.selectSources([other, relevant], '请对比 Actuator Reality Shaping for Zero-Shot Sim-to-Real Robot Learning');
  assert.ok(named.some(s => s.attachmentKey === 'OTHER001'));
});

test('reading-summary input keeps current-PDF explanations and excludes attached cross-paper source caches', () => {
  const state = { conversations: [{ id: 'current', title: '当前论文', history: [
    { role: 'user', content: '如何理解正定惯性参数？', materials: [] },
    { role: 'assistant', content: '当前论文用正定矩阵表示物理一致的惯性参数。', incomplete: false,
      memorySources: [{ title: 'Actuator Reality Shaping', text: 'UNRELATED_SOURCE_CACHE: simulated motor and DOB' }] }
  ] }] };
  const text = S.collect(state).map(e => e.text).join('');
  assert.match(text, /当前论文用正定矩阵表示物理一致的惯性参数/);
  assert.doesNotMatch(text, /UNRELATED_SOURCE_CACHE|Actuator Reality Shaping|simulated motor|DOB/);
});

test('query cleaning preserves scientific compound terms and electrical current', async () => {
  const condition = await paper('条件数', '条件数刻画线性系统对输入误差的敏感程度。');
  const current = await paper('current', 'Electrical current is measured in amperes.');
  for (const [doc, query] of [[condition, '条件数'], [current, 'current']]) {
    const sources = M.selectSources([doc], query);
    assert.equal(sources.length, 1, query);
    assert.equal(sources[0].attachmentKey, 'OTHER001');
  }
});
