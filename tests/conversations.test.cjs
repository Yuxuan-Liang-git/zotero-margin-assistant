const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

const scope = { libraryID: 1, attachmentKey: 'ABCD1234' };

test('legacy PDF dialogue is migrated intact and the original bytes are backed up', async () => {
  const old = { version: 1, sources: [], references: [], history: [
    { role: 'user', content: '解释公式 (6.30)', materials: [] },
    { role: 'assistant', content: '原来的回答', materials: [], incomplete: false },
  ], draft: '继续追问', images: [], imageNoteKey: null };
  const original = JSON.stringify(old);
  const files = new Map([['1-ABCD1234.json', original]]);
  const store = new C.LocalStore({
    exists: async path => files.has(path), read: async path => files.get(path),
    writeAtomic: async (path, data) => files.set(path, data),
  });
  const state = await store.load(scope);
  assert.equal(state.version, 2);
  assert.equal(state.conversations.length, 1);
  assert.equal(state.conversations[0].history[1].content, '原来的回答');
  assert.equal(state.conversations[0].draft, '继续追问');
  assert.equal(state.activeConversationId, state.conversations[0].id);
  assert.equal(files.get('1-ABCD1234.json.v1.bak'), original);
  await store.save(scope, state);
  assert.equal(JSON.parse(files.get('1-ABCD1234.json')).version, 2);
  assert.equal(files.get('1-ABCD1234.json.v1.bak'), original);
});

test('each PDF can create and switch independent persistent conversations', () => {
  const state = C.emptyState();
  const first = C.activeConversation(state);
  first.history.push({ role: 'user', content: '第一段问题', materials: [] });
  first.draft = '第一段草稿';
  C.touchConversation(first, 100);
  const second = C.createConversation(state, 'chat-two', 200);
  second.history.push({ role: 'user', content: '第二段问题', materials: [] });
  second.draft = '第二段草稿';
  C.touchConversation(second, 300);
  assert.equal(C.activeConversation(state).id, 'chat-two');
  C.selectConversation(state, first.id);
  assert.equal(C.activeConversation(state).draft, '第一段草稿');
  const restored = C.cleanState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.conversations.length, 2);
  assert.equal(C.activeConversation(restored).history[0].content, '第一段问题');
  C.selectConversation(restored, 'chat-two');
  assert.equal(C.activeConversation(restored).history[0].content, '第二段问题');
  assert.equal(C.emptyState().conversations.length, 1);
});

test('conversation storage strips credentials and rejects invalid active IDs', () => {
  const state = C.emptyState();
  state.apiKey = 'PRIVATE-KEY';
  state.conversations[0].apiKey = 'PRIVATE-KEY';
  assert.ok(!JSON.stringify(C.cleanState(state)).includes('PRIVATE-KEY'));
  assert.throws(() => C.cleanState({ ...state, activeConversationId: 'missing' }), /对话/);
  assert.throws(() => C.createConversation(state, state.conversations[0].id, 1), /重复/);
});
test('per-PDF recap checkpoint survives persistence while all original messages remain',()=>{
  const state=C.emptyState(),chat=C.activeConversation(state);
  for(let i=0;i<9;i++)chat.history.push({role:i%2?'assistant':'user',content:`message-${i}`,materials:[]});
  chat.summary='较早的对话：讨论了公式 6.30';chat.compactedThrough=4;
  const restored=C.cleanState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.conversations[0].history.length,9);
  assert.equal(restored.conversations[0].summary,chat.summary);
  assert.equal(restored.conversations[0].compactedThrough,4);
  assert.throws(()=>C.cleanState({...state,conversations:[{...chat,compactedThrough:999}]}),/摘要|对话/);
});
test('one oversized completed turn can be summarized instead of blocking the next question',()=>{
  const chat=C.activeConversation(C.emptyState());chat.history.push({role:'user',content:'解释整个推导',materials:[]},{role:'assistant',content:'长回答'.repeat(20000),materials:[],incomplete:false});
  assert.equal(C.compactionTarget(chat),2);
  chat.history[1].incomplete=true;
  assert.equal(C.compactionTarget(chat),0);
});
test('many short turns do not cause compaction solely because of message count',()=>{const chat=C.activeConversation(C.emptyState());for(let i=0;i<40;i++)chat.history.push({role:i%2?'assistant':'user',content:'简短问答'.repeat(20),materials:[]});assert.equal(C.compactionTarget(chat),0);});
test('compaction leaves enough headroom for several following turns',()=>{const chat=C.activeConversation(C.emptyState());for(let i=0;i<20;i++)chat.history.push({role:i%2?'assistant':'user',content:'字'.repeat(1700),materials:[]});const through=C.compactionTarget(chat);assert.ok(through>0);chat.compactedThrough=through;chat.summary='已有摘要';for(let i=0;i<8;i++)chat.history.push({role:i%2?'assistant':'user',content:'继续'.repeat(300),materials:[]});assert.equal(C.compactionTarget(chat),through);});
