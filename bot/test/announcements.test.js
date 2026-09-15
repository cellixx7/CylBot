const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AnnouncementService } = require('../src/services/announcementService');

test('padrões persistem e ficam isolados por servidor', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'announcements-'));
  const file = path.join(dir, 'data.json');
  const service = new AnnouncementService(file);
  const category = service.save('a', { name: 'Novidades', title: 'Novidades!', description: 'Confira', image: 'https://example.com/image.png' });
  assert.equal(new AnnouncementService(file).categories('a').length, 5);
  assert.equal(service.categories('b').length, 4);
  service.save('a', { ...category, title: 'Novo título' });
  assert.equal(service.categories('a')[4].title, 'Novo título');
  assert.throws(() => service.save('a', { ...category, image: 'javascript:alert(1)' }));
  assert.throws(() => service.save('a', { name: 'Novidades', title: 'Duplicada' }));
  fs.rmSync(dir, { recursive: true });
});

test('contexto substitui prévia; envio verifica dono, servidor e duplicação', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'announcements-'));
  const calls = [];
  const service = new AnnouncementService(path.join(dir, 'data.json'), { generate: async input => { calls.push(input); return { content: `Descrição ${calls.length}` }; } });
  const input = { guildId: 'a', guildName: 'Servidor A', owner: 'user', channelId: 'channel', categoryId: 'default-0', description: 'Manutenção às 10h' };
  const first = await service.generate(input);
  assert.equal(first.embed.title, 'Aviso');
  assert.match(first.embed.footer.text, /Servidor A/);
  assert.throws(() => service.get(first.draftId, 'other', 'a'));
  const revised = await service.generate({ ...input, draftId: first.draftId, context: 'Duração de 30 minutos' });
  assert.equal(calls[1].currentText, 'Descrição 1');
  assert.equal(calls[1].additionalContext, 'Duração de 30 minutos');
  assert.throws(() => service.get(first.draftId, 'user', 'a'));
  let sends = 0;
  let release;
  const channel = { id: 'channel', guildId: 'a', isTextBased: () => true, send: async payload => { sends++; assert.deepEqual(payload.allowedMentions, { parse: [] }); await new Promise(resolve => { release = resolve; }); } };
  await assert.rejects(service.send(revised.draftId, 'user', 'a', { ...channel, guildId: 'b' }));
  const pending = service.send(revised.draftId, 'user', 'a', channel);
  await assert.rejects(service.send(revised.draftId, 'user', 'a', channel));
  release(); await pending;
  assert.equal(sends, 1);
  await assert.rejects(service.send(revised.draftId, 'user', 'a', channel));
  const retry = await service.generate(input);
  await assert.rejects(service.send(retry.draftId, 'user', 'a', { ...channel, send: async () => { throw new Error('Falha'); } }));
  assert.equal(service.get(retry.draftId, 'user', 'a').busy, false);
  service.get(retry.draftId, 'user', 'a').expires = 0;
  assert.throws(() => service.get(retry.draftId, 'user', 'a'));
  fs.rmSync(dir, { recursive: true });
});

test('comando e componentes são serializáveis e registrados', () => {
  const commands = require('../src/commands');
  assert(commands.some(c => c.data.toJSON().name === 'anuncios'));
  const { categoryPicker } = require('../src/handlers/announcementHandler');
  const picker = categoryPicker('test');
  assert.equal(picker.components[0].toJSON().components[0].options.length, 4);
  assert.equal(picker.components[1].toJSON().components[0].label, 'Adicionar');
});

test('seleção abre ações e os modais usam IDs próprios de anúncios', async () => {
  const { handleAnnouncementInteraction } = require('../src/handlers/announcementHandler');
  let message;
  await handleAnnouncementInteraction({ customId: 'ann:choose', guildId: 'test', values: ['default-0'], update: async p => { message = p; } });
  assert.equal(message.components[0].toJSON().components[0].custom_id, 'ann:write:default-0');
  for (const customId of ['ann:add', 'ann:edit:default-0', 'ann:write:default-0']) {
    let modal;
    await handleAnnouncementInteraction({ customId, guildId: 'test', showModal: async m => { modal = m.toJSON(); } });
    assert(modal.custom_id.startsWith('ann:'));
    assert(modal.components.length <= 5);
  }
});
