const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CredentialStore } = require('../src/credentials.js');

function fixture() {
  const prefs = new Map();
  const adapter = {
    get: name => prefs.get(name), set: (name, value) => prefs.set(name, value),
    clear: name => prefs.delete(name),
    encrypt: async plain => 'oskv1:' + Buffer.from(plain).toString('base64'),
    decrypt: async cipher => Buffer.from(cipher.slice(6), 'base64').toString(),
  };
  return { prefs, adapter };
}

test('DeepSeek key survives reload only as encrypted preference and can be cleared', async () => {
  const { prefs, adapter } = fixture();
  const store = new CredentialStore(adapter);
  await store.save('sk-private-example', 'deepseek-flash');
  assert.ok(!JSON.stringify([...prefs]).includes('sk-private-example'));
  assert.equal(prefs.get('margincomments.deepseekKey').startsWith('oskv1:'), true);
  assert.deepEqual(await new CredentialStore(adapter).load(), { key: 'sk-private-example', model: 'deepseek-flash' });
  await store.save('', 'deepseek-chat');
  assert.deepEqual(await new CredentialStore(adapter).load(), { key: 'sk-private-example', model: 'deepseek-chat' });
  await store.clear();
  assert.deepEqual(await new CredentialStore(adapter).load(), { key: '', model: 'deepseek-chat' });
});

test('failed encryption cannot replace an existing key with plaintext', async () => {
  const { prefs, adapter } = fixture();
  const store = new CredentialStore(adapter);
  await store.save('old-secret', 'deepseek-flash');
  const before = prefs.get('margincomments.deepseekKey');
  adapter.encrypt = async () => { throw new Error('key store unavailable'); };
  await assert.rejects(store.save('new-secret', 'deepseek-chat'), /key store unavailable/);
  assert.equal(prefs.get('margincomments.deepseekKey'), before);
  assert.equal(prefs.get('margincomments.deepseekModel'), 'deepseek-flash');
});
