const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AnnouncementDraftManager } = require('../src/services/announcementDraftManager');

const data = { owner: 'user', guildId: 'guild', channelId: 'channel', payload: { text: 'Prévia' } };
const unavailable = { statusCode: 400, message: 'Prévia expirada, substituída ou indisponível. Gere uma nova prévia.' };
const busy = { statusCode: 400, message: 'Aguarde a operação atual.' };

test('draft preserva conteúdo e só pode ser recuperado pelo owner e guild corretos', () => {
  const manager = new AnnouncementDraftManager();
  const id = manager.create(data);
  const draft = manager.get(id, 'user', 'guild');
  assert.equal(draft.channelId, 'channel');
  assert.deepEqual(draft.payload, data.payload);
  assert.equal(draft.busy, false);
  assert.throws(() => manager.get(id, 'other', 'guild'), unavailable);
  assert.throws(() => manager.get(id, 'user', 'other'), unavailable);
  assert.throws(() => manager.get('missing', 'user', 'guild'), unavailable);
});

test('TTL é de 15 minutos, não renova na leitura e limpeza remove expirados', t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const manager = new AnnouncementDraftManager();
  const id = manager.create(data);
  const expires = manager.get(id, 'user', 'guild').expires;
  assert.equal(expires, 1000 + 15 * 60_000);
  now = expires - 1;
  assert.equal(manager.get(id, 'user', 'guild').expires, expires);
  now = expires;
  assert.throws(() => manager.get(id, 'user', 'guild'), unavailable);
  manager.cleanupExpired();
  now = 1000; // Retroceder o relógio prova que o registro foi removido.
  assert.throws(() => manager.get(id, 'user', 'guild'), unavailable);
});

test('criação limpa expirados sem remover drafts ainda válidos', t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const manager = new AnnouncementDraftManager();
  const oldId = manager.create(data);
  now += 60_000;
  const activeId = manager.create(data);
  now = 1000 + 15 * 60_000;
  const newId = manager.create(data);
  assert(manager.get(activeId, 'user', 'guild'));
  assert(manager.get(newId, 'user', 'guild'));
  now = 1000;
  assert.throws(() => manager.get(oldId, 'user', 'guild'), unavailable);
});

test('substituição invalida prévia anterior e inicia novo TTL sem busy', t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const manager = new AnnouncementDraftManager();
  const id = manager.create(data);
  const previous = manager.get(id, 'user', 'guild');
  manager.markBusy(previous);
  now += 60_000;
  const replacement = manager.replace(id, { ...data, payload: { text: 'Revisada' } });
  manager.release(previous);
  assert.notEqual(replacement, id);
  assert.throws(() => manager.get(id, 'user', 'guild'), unavailable);
  const draft = manager.get(replacement, 'user', 'guild');
  assert.equal(draft.payload.text, 'Revisada');
  assert.equal(draft.expires, now + 15 * 60_000);
  assert.equal(draft.busy, false);
});

test('busy bloqueia concorrência e release permite tentar novamente', () => {
  const manager = new AnnouncementDraftManager();
  const id = manager.create(data);
  const draft = manager.get(id, 'user', 'guild');
  manager.markBusy(draft);
  assert.throws(() => manager.assertAvailable(draft), busy);
  assert.throws(() => manager.markBusy(draft), busy);
  manager.release(draft);
  assert.equal(manager.get(id, 'user', 'guild').busy, false);
  manager.markBusy(draft);
  manager.release(draft);
});

test('remoção impede recuperação e release não ressuscita draft removido', () => {
  const manager = new AnnouncementDraftManager();
  const id = manager.create(data);
  const draft = manager.get(id, 'user', 'guild');
  manager.markBusy(draft);
  manager.remove(id);
  manager.release(draft);
  assert.throws(() => manager.get(id, 'user', 'guild'), unavailable);
});
