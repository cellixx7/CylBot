require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { tempDirectory } = require('./helpers/tempDirectory');
const path = require('node:path');
const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const admin = { permissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild) };
const { AnnouncementService } = require('../src/services/announcementService');
const { JsonAnnouncementRepository } = require('../src/repositories/jsonAnnouncementRepository');

test('padrões persistem e ficam isolados por servidor', t => {
  const dir = tempDirectory(t, 'announcements-');
  const file = path.join(dir, 'data.json');
  const service = new AnnouncementService(new JsonAnnouncementRepository(file));
  const category = service.save('a', { name: 'Novidades', title: 'Novidades!', description: 'Confira', image: 'https://example.com/image.png' }, admin);
  assert.equal(new AnnouncementService(new JsonAnnouncementRepository(file)).categories('a').length, 5);
  assert.equal(service.categories('b').length, 4);
  service.save('a', { ...category, title: 'Novo título' }, admin);
  assert.equal(service.categories('a')[4].title, 'Novo título');
  assert.throws(() => service.save('a', { ...category, image: 'javascript:alert(1)' }, admin));
  assert.throws(() => service.save('a', { name: 'Novidades', title: 'Duplicada' }, admin));
});

test('contexto substitui prévia; envio verifica dono, servidor e duplicação', async t => {
  const dir = tempDirectory(t, 'announcements-');
  const calls = [];
  const service = new AnnouncementService(new JsonAnnouncementRepository(path.join(dir, 'data.json')), { generate: async input => { calls.push(input); return { content: `Descrição ${calls.length}` }; } });
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
});

test('comando anuncia opções e custom IDs esperados', t => {
  const { announcements } = require('../src/services/announcementService');
  const service = new AnnouncementService({ getCategories: () => undefined });
  t.mock.method(announcements, 'categories', service.categories.bind(service));
  const commands = require('../src/commands');
  assert(commands.some(c => c.data.toJSON().name === 'anuncios'));
  const { categoryPicker } = require('../src/handlers/announcementHandler');
  const picker = categoryPicker('test');
  assert.equal(picker.components[0].toJSON().components[0].options.length, 4);
  assert.equal(picker.components[1].toJSON().components[0].label, 'Adicionar');
});

test('seleção abre ações e os modais usam IDs próprios de anúncios', async t => {
  const { announcements } = require('../src/services/announcementService');
  const service = new AnnouncementService({ getCategories: () => undefined });
  t.mock.method(announcements, 'categories', service.categories.bind(service));
  const { handleAnnouncementInteraction } = require('../src/handlers/announcementHandler');
  let message;
  await handleAnnouncementInteraction({ customId: 'ann:choose', guildId: 'test', values: ['default-0'], update: async p => { message = p; } });
  assert.equal(message.components[0].toJSON().components[0].custom_id, 'ann:write:default-0');
  for (const customId of ['ann:add', 'ann:edit:default-0', 'ann:write:default-0']) {
    let modal;
    await handleAnnouncementInteraction({ customId, guildId: 'test', memberPermissions: admin.permissions, showModal: async m => { modal = m.toJSON(); } });
    assert(modal.custom_id.startsWith('ann:'));
    assert(modal.components.length <= 5);
  }
});

test('autorização administrativa exige permissões verificadas ou exceção local explícita', () => {
  const { canManageAnnouncements } = require('../src/services/announcementPermissions');
  assert.equal(canManageAnnouncements(admin), true);
  assert.equal(canManageAnnouncements({ member: { permissions: admin.permissions } }), true);
  assert.equal(canManageAnnouncements({ permissions: new PermissionsBitField(0n) }), false);
  assert.equal(canManageAnnouncements({ permissions: 'inválida' }), false);
  assert.equal(canManageAnnouncements({ guildId: 'a', owner: 'local-web' }), false);
  assert.equal(canManageAnnouncements({ source: 'local-web' }), false);
  assert.equal(canManageAnnouncements({ source: 'local-web', trustedLocal: true }), true);
});

test('service bloqueia inclusão e edição sem autorização antes de persistir', t => {
  const dir = tempDirectory(t, 'announcements-');
  const file = path.join(dir, 'data.json');
  const service = new AnnouncementService(new JsonAnnouncementRepository(file));
  const input = { name: 'Nova', title: 'Título' };
  assert.throws(() => service.save('a', input), { statusCode: 403 });
  assert.equal(fs.existsSync(file), false);
  const created = service.save('a', input, admin);
  const before = fs.readFileSync(file, 'utf8');
  assert.throws(() => service.save('a', { ...created, title: 'Mudança' }, { permissions: 0n }), { statusCode: 403 });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  service.save('a', { ...created, title: 'Local' }, { source: 'local-web', trustedLocal: true });
  assert.equal(service.categories('a').at(-1).title, 'Local');
});

test('custom IDs administrativos não permitem abrir nem salvar sem ManageGuild', async () => {
  const { handleAnnouncementInteraction } = require('../src/handlers/announcementHandler');
  for (const customId of ['ann:add', 'ann:edit:default-0', 'ann:save:new', 'ann:save:default-0']) {
    let reply;
    await handleAnnouncementInteraction({
      customId, guildId: 'test', memberPermissions: new PermissionsBitField(0n),
      showModal: async () => assert.fail('Não deve abrir modal'),
      fields: { getTextInputValue: () => assert.fail('Não deve ler campos nem salvar') },
      reply: async payload => { reply = payload; },
    });
    assert.equal(reply.ephemeral, true);
    assert.match(reply.content, /Gerenciar Servidor/);
  }
});

test('handler permite administrador adicionar categoria e editar padrão', async t => {
  const { announcements } = require('../src/services/announcementService');
  const { handleAnnouncementInteraction } = require('../src/handlers/announcementHandler');
  const dir = tempDirectory(t, 'announcements-');
  const service = new AnnouncementService(new JsonAnnouncementRepository(path.join(dir, 'data.json')));
  t.mock.method(announcements, 'save', service.save.bind(service));
  t.mock.method(announcements, 'categories', service.categories.bind(service));
  const fields = { name: 'Nova', title: 'Título', description: '', image: '' };
  const interaction = {
    guildId: 'test', memberPermissions: admin.permissions,
    fields: { getTextInputValue: key => fields[key] },
    reply: async payload => { assert.equal(payload.ephemeral, true); assert.equal(payload.content.includes('Gerenciar Servidor'), false); },
  };
  await handleAnnouncementInteraction({ ...interaction, customId: 'ann:save:new' });
  const category = service.categories('test').at(-1);
  assert.equal(category.name, 'Nova');
  fields.title = 'Editado';
  await handleAnnouncementInteraction({ ...interaction, customId: `ann:save:${category.id}` });
  assert.equal(service.categories('test').at(-1).title, 'Editado');
});

test('usuário comum gera e revisa; envio valida permissões efetivas do canal', async t => {
  const { announcements } = require('../src/services/announcementService');
  const { handleAnnouncementInteraction } = require('../src/handlers/announcementHandler');
  const dir = tempDirectory(t, 'announcements-');
  const calls = [];
  const service = new AnnouncementService(new JsonAnnouncementRepository(path.join(dir, 'data.json')), { generate: async input => { calls.push(input); return { content: 'Texto' }; } });
  for (const method of ['generate', 'send']) t.mock.method(announcements, method, service[method].bind(service));
  let preview;
  const base = {
    guildId: 'a', guild: { name: 'Servidor' }, user: { id: 'user' }, member: { id: 'user' },
    memberPermissions: new PermissionsBitField(0n), channelId: 'channel',
    fields: { getTextInputValue: () => 'Contexto' },
    deferReply: async () => {}, editReply: async payload => { preview = payload; },
    reply: async payload => assert.fail(payload.content),
  };
  await handleAnnouncementInteraction({ ...base, customId: 'ann:generate:default-0' });
  const firstId = preview.components[0].toJSON().components[0].custom_id.split(':')[2];
  await handleAnnouncementInteraction({ ...base, customId: `ann:revise:${firstId}` });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].currentText, 'Texto');
  assert.equal(calls[1].additionalContext, 'Contexto');
  const draftId = preview.components[0].toJSON().components[0].custom_id.split(':')[2];
  assert.throws(() => service.get(firstId, 'user', 'a'));
  let sends = 0;
  const channel = { id: 'channel', guildId: 'a', isTextBased: () => true, send: async () => { sends++; } };
  for (const bits of [0n, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) {
    let denial;
    await handleAnnouncementInteraction({ ...base, customId: `ann:send:${draftId}`,
      // ManageGuild não substitui as permissões efetivas do canal.
      memberPermissions: admin.permissions,
      channel: { ...channel, permissionsFor: () => new PermissionsBitField(bits) },
      deferUpdate: async () => assert.fail('Não deve confirmar a interação'),
      reply: async payload => { denial = payload; },
    });
    assert.equal(denial.ephemeral, true);
    assert.match(denial.content, /permissão para enviar/);
    assert.equal(sends, 0);
    assert(service.get(draftId, 'user', 'a'));
  }
  await assert.rejects(service.send(draftId, 'user', 'a', null));
  await assert.rejects(service.send(draftId, 'user', 'a', { ...channel, isTextBased: () => false }));
  await assert.rejects(service.send(draftId, 'user', 'a', { ...channel, send: true }));
  await handleAnnouncementInteraction({ ...base, customId: `ann:send:${draftId}`,
    channel: { ...channel, permissionsFor: member => { assert.equal(member.id, 'user'); return new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]); } },
    deferUpdate: async () => {},
  });
  assert.equal(sends, 1);
  assert.throws(() => service.get(draftId, 'user', 'a'));
});


test('threads exigem SendMessagesInThreads e ausência de permissões bloqueia envio', async t => {
  const { announcements } = require('../src/services/announcementService');
  const { handleAnnouncementInteraction } = require('../src/handlers/announcementHandler');
  let sends = 0;
  t.mock.method(announcements, 'send', async () => { sends++; });
  const base = {
    customId: 'ann:send:draft', guildId: 'a', user: { id: 'user' }, member: { id: 'user' },
    deferUpdate: async () => {}, editReply: async () => {},
  };
  const channel = { guildId: 'a', isTextBased: () => true, isThread: () => true, send: async () => {} };
  for (const permissions of [null, new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])]) {
    let denial;
    await handleAnnouncementInteraction({ ...base,
      channel: { ...channel, permissionsFor: () => permissions },
      reply: async payload => { denial = payload; },
    });
    assert.equal(denial.ephemeral, true);
    assert.equal(sends, 0);
  }
  await handleAnnouncementInteraction({ ...base,
    channel: { ...channel, permissionsFor: () => new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessagesInThreads]) },
    reply: async payload => assert.fail(payload.content),
  });
  assert.equal(sends, 1);
});

test('service usa repository substituível e mantém regras sem filesystem', () => {
  const data = new Map();
  let writes = 0;
  const repository = {
    getCategories: guildId => structuredClone(data.get(guildId)),
    saveCategories: (guildId, categories) => { writes++; data.set(guildId, structuredClone(categories)); },
  };
  const service = new AnnouncementService(repository);
  assert.deepEqual(service.categories('a').map(c => c.name), ['Aviso', 'Manutenção', 'Evento', 'Notificação']);
  assert.equal(writes, 0);
  assert.throws(() => service.save('a', { name: 'Nova', title: 'Título' }), { statusCode: 403 });
  assert.equal(writes, 0);
  const category = service.save('a', { name: 'Nova', title: 'Título' }, admin);
  assert.equal(service.categories('a').length, 5);
  assert.equal(service.categories('b').length, 4);
  assert.throws(() => service.save('a', { name: 'nova', title: 'Duplicada' }, admin), /Já existe/);
  assert.throws(() => service.save('a', { ...category, image: 'http://example.com/image.png' }, admin), /HTTPS/);
  assert.throws(() => service.save('a', { ...category, id: 'inexistente' }, admin), /Categoria não encontrada/);
  assert.equal(writes, 1);
  for (let i = 0; i < 20; i++) service.save('a', { name: `Categoria ${i}`, title: 'Título' }, admin);
  assert.equal(service.categories('a').length, 25);
  assert.throws(() => service.save('a', { name: 'Excedente', title: 'Título' }, admin), /25 categorias/);
  assert.equal(writes, 21);
  service.save('a', { ...category, title: 'Editado no limite' }, admin);
  assert.equal(service.categories('a').find(c => c.id === category.id).title, 'Editado no limite');
  data.set('b', []);
  assert.deepEqual(service.categories('b'), []);
});

test('manager injetado coordena revisão concorrente, falhas de IA e publicação', async () => {
  const { AnnouncementDraftManager } = require('../src/services/announcementDraftManager');
  const manager = new AnnouncementDraftManager();
  const repository = { getCategories: () => undefined };
  let generate = async () => ({ content: 'Descrição inicial' });
  const service = new AnnouncementService(repository, { generate: input => generate(input) }, manager);
  const input = { guildId: 'guild', guildName: 'Servidor', owner: 'user', channelId: 'channel', categoryId: 'default-0', description: 'Ideia' };
  const first = await service.generate(input);
  assert.equal(service.get(first.draftId, 'user', 'guild'), manager.get(first.draftId, 'user', 'guild'));
  first.embed.description = 'Resposta alterada pelo chamador';
  assert.equal(service.get(first.draftId, 'user', 'guild').embed.description, 'Descrição inicial');
  let rejectGeneration;
  generate = () => new Promise((resolve, reject) => { rejectGeneration = reject; });
  const revision = { ...input, draftId: first.draftId, context: 'Mais contexto' };
  const pending = service.generate(revision);
  assert.equal(manager.get(first.draftId, 'user', 'guild').busy, true);
  await assert.rejects(service.generate(revision), /Aguarde a operação atual/);
  let sends = 0;
  const channel = { id: 'channel', guildId: 'guild', isTextBased: () => true, send: async () => { sends++; } };
  await assert.rejects(service.send(first.draftId, 'user', 'guild', channel), /Aguarde a operação atual/);
  rejectGeneration(new Error('IA indisponível'));
  await assert.rejects(pending, /IA indisponível/);
  assert.equal(manager.get(first.draftId, 'user', 'guild').busy, false);
  assert.equal(sends, 0);
  generate = async () => ({ content: 'Revisada' });
  const revised = await service.generate(revision);
  assert.throws(() => manager.get(first.draftId, 'user', 'guild'));
  assert.equal(manager.get(revised.draftId, 'user', 'guild').channelId, 'channel');
  await assert.rejects(service.send(revised.draftId, 'user', 'guild', { ...channel, send: async () => { throw new Error('Falha Discord'); } }), /Falha Discord/);
  assert.equal(manager.get(revised.draftId, 'user', 'guild').busy, false);
  await service.send(revised.draftId, 'user', 'guild', channel);
  assert.throws(() => manager.get(revised.draftId, 'user', 'guild'));
  await assert.rejects(service.send(revised.draftId, 'user', 'guild', channel));
  assert.equal(sends, 1);
});

test('handler ignora custom IDs de outras features sem executar operações', async () => {
  const { handleAnnouncementInteraction } = require('../src/handlers/announcementHandler');
  for (const customId of [undefined, 'texta_ai:send:123', 'other:save']) {
    assert.equal(await handleAnnouncementInteraction({ customId }), false);
  }
});

test('falha de persistência chega ao chamador e permite nova tentativa', () => {
  let stored;
  let failing = true;
  const failure = new Error('Disco indisponível');
  const repository = {
    getCategories: () => structuredClone(stored),
    saveCategories: (guildId, categories) => { if (failing) throw failure; stored = structuredClone(categories); },
  };
  const service = new AnnouncementService(repository);
  const category = { name: 'Nova', title: 'Título' };
  assert.throws(() => service.save('a', category, admin), error => error === failure);
  assert.equal(service.categories('a').length, 4);
  failing = false;
  service.save('a', category, admin);
  assert.equal(service.categories('a').length, 5);
});
