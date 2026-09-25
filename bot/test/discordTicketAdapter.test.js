require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Collection, ChannelType, PermissionFlagsBits: P, PermissionsBitField } = require('discord.js');
const { DiscordTicketAdapter, BOT_PERMISSIONS } = require('../src/Ticket/providers/discordTicketAdapter');
const { ids } = require('./helpers/ticketFixture');
const botId = '999999999999999999';
function setup() {
  let seq = 100000000000000000n;
  const channels = new Collection();
  const created = [];
  const bot = { id: botId, permissions: new PermissionsBitField(BOT_PERMISSIONS) };
  const role = { id: ids.role, managed: false };
  const guild = { id: ids.guild, name: 'Guild',
    members: { fetchMe: async () => bot, fetch: async input => ({ id: input.user, displayName: 'Member', user: { bot: false }, permissions: new PermissionsBitField(0n), roles: { cache: new Collection([[ids.role, role]]) } }) },
    roles: { everyone: { id: ids.guild }, fetch: async id => id === ids.role ? role : null },
    channels: { fetch: async id => id ? channels.get(id) || null : channels,
      create: async options => {
        const channel = makeChannel(String(++seq), options.type, options.permissionOverwrites || channels.get(options.parent)?.rawOverwrites || []);
        channel.topic = options.topic; created.push(options); return channel;
      } },
  };
  function makeChannel(id, type, overwrites) {
    const channel = { id, guildId: ids.guild, guild, type, rawOverwrites: overwrites,
      permissionsFor: target => {
        const targetId = typeof target === 'string' ? target : target.id;
        if (targetId === botId) return bot.permissions;
        if (targetId === ids.guild) return new PermissionsBitField(channel.private ? [] : [P.ViewChannel, P.ReadMessageHistory]);
        return new PermissionsBitField([P.ViewChannel, P.ReadMessageHistory]);
      },
      permissionOverwrites: { cache: new Collection(overwrites.map(item => [item.id, { ...item, allow: new PermissionsBitField(item.allow), deny: new PermissionsBitField(item.deny) }])),
        async set(values) { channel.rawOverwrites = values; channel.permissionOverwrites.cache = new Collection(values.map(item => [item.id, { ...item, allow: new PermissionsBitField(item.allow), deny: new PermissionsBitField(item.deny) }])); } },
      async send(payload) { channel.sent = payload; return { id: `message-${id}` }; },
      async delete() { channels.delete(id); channel.deleted = true; },
    };
    channels.set(id, channel); return channel;
  }
  const client = { user: { id: botId }, guilds: { fetch: async id => id === guild.id ? guild : null } };
  const adapter = new DiscordTicketAdapter(client, { messageContentEnabled: true });
  const privateOverwrites = adapter.overwrites(ids.guild, botId, [ids.role]);
  makeChannel(ids.panel, ChannelType.GuildText, []);
  makeChannel(ids.log, ChannelType.GuildText, privateOverwrites);
  makeChannel(ids.category, ChannelType.GuildCategory, privateOverwrites);
  const config = { guildId: ids.guild, setupId: 'setup', mode: 'existing', supportRoleIds: [ids.role], panelChannelId: ids.panel, logChannelId: ids.log, activeCategoryId: ids.category };
  return { adapter, client, guild, bot, role, channels, created, config, makeChannel };
}

test('leitura concorrente do ator compartilha fetch live; próximo ciclo detecta perda de cargo', async () => {
  const f = setup(); let calls = 0; let resolve;
  const fetch = f.guild.members.fetch;
  f.guild.members.fetch = async options => { calls++; assert.equal(options.force, true); return new Promise(done => { resolve = () => done(fetch(options)); }); };
  const first = f.adapter.getActor(ids.guild, ids.user);
  const second = f.adapter.getActor(ids.guild, ids.user);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(calls, 1); resolve();
  const [left, right] = await Promise.all([first, second]);
  left.roleIds.length = 0; assert.deepEqual(right.roleIds, [ids.role]);
  f.guild.members.fetch = async options => { calls++; const member = await fetch(options); member.roles.cache.clear(); return member; };
  assert.deepEqual((await f.adapter.getActor(ids.guild, ids.user)).roleIds, []);
  assert.equal(calls, 2); assert.equal(f.adapter.pendingActors.size, 0);
});

test('leitura do ator distingue membership, rate limit, timeout, upstream e erro interno sem retry extra', async () => {
  const f = setup(); let calls = 0;
  for (const [error, status, code] of [
    [{ code: 10007 }, 403, 'DISCORD_MEMBER_MISSING'], [{ code: 10004 }, 403, 'DISCORD_ACCESS_DENIED'],
    [{ status: 503 }, 502, 'DISCORD_UPSTREAM_FAILED'], [{ name: 'TimeoutError' }, 502, 'DISCORD_CONNECTION_FAILED'],
    [{ name: 'RateLimitError', retryAfter: 32000 }, 429, 'DISCORD_RATE_LIMIT'],
  ]) {
    f.guild.members.fetch = async () => { calls++; throw error; };
    await assert.rejects(f.adapter.getActor(ids.guild, ids.user), result => result.statusCode === status && result.code === code &&
      (status !== 429 || result.retryAfter === 32));
    assert.equal(f.adapter.pendingActors.size, 0);
  }
  assert.equal(calls, 5);
  const internal = new TypeError('programming error');
  f.guild.members.fetch = async () => { throw internal; };
  await assert.rejects(f.adapter.getActor(ids.guild, ids.user), error => error === internal);
  f.client.isReady = () => false;
  await assert.rejects(f.adapter.getActor(ids.guild, ids.user), error => error.statusCode === 503);
});

test('adapter valida intent, cargos, permissões efetivas, tipo e privacidade do log', async () => {
  const f = setup(); await f.adapter.validateSetup(f.config);
  f.adapter.config.messageContentEnabled = false;
  await assert.rejects(f.adapter.validateSetup(f.config), /Message Content/);
  f.adapter.config.messageContentEnabled = true;
  f.bot.permissions = new PermissionsBitField([P.ViewChannel]);
  await assert.rejects(f.adapter.validateSetup(f.config), /permissões/);
  f.bot.permissions = new PermissionsBitField(BOT_PERMISSIONS);
  f.role.managed = true;
  await assert.rejects(f.adapter.validateSetup(f.config), /cargo/);
  f.role.managed = false;
  await assert.rejects(f.adapter.validateStructure({ ...f.config, logChannelId: ids.panel }), /diferentes/);
  await f.channels.get(ids.log).permissionOverwrites.set([]);
  await assert.rejects(f.adapter.validateStructure(f.config), /logs deve negar/);
  await assert.rejects(f.adapter.channel(ids.guild, ids.panel, ChannelType.GuildCategory), /inválido/);
});

test('log com allow explícito a terceiro é rejeitado mesmo com deny de @everyone', async () => {
  const f = setup(); const channel = f.channels.get(ids.log);
  await channel.permissionOverwrites.set([...channel.rawOverwrites, { id: ids.user, allow: [P.ViewChannel] }]);
  await assert.rejects(f.adapter.validatePrivateLog(ids.guild, ids.log, [ids.role]), /somente/);
});

test('encaminhamento da IA registra motivo seguro no log privado sem conteúdo do usuário', async () => {
  const f = setup();
  const ticket = { id: 'ticket-sintetico', sequence: 7, guildId: ids.guild, channelId: ids.panel,
    logChannelId: ids.log, supportRoleIds: [ids.role] };
  await f.adapter.aiHandoffStaff(ticket, 'run-sintetico', 'sensitive_action_required');
  const content = f.channels.get(ids.log).sent.content;
  assert.match(content, /Motivo: ação sensível exige equipe/);
  assert.doesNotMatch(content, /pergunta|mensagem do usuário/i);
});

test('publicar transcript revalida privacidade do log antes de enviar o anexo', async () => {
  const f = setup();
  const channel = f.channels.get(ids.log);
  await f.adapter.validatePrivateLog(ids.guild, ids.log, [ids.role]);
  await channel.permissionOverwrites.set([...channel.rawOverwrites, { id: ids.user, allow: [P.ViewChannel] }]);
  const ticket = { guildId: ids.guild, logChannelId: ids.log, supportRoleIds: [ids.role] };
  await assert.rejects(f.adapter.publishClosed(ticket, Buffer.from('transcript sintético')), /somente/);
  assert.equal(channel.sent, undefined);
});

test('estrutura automática cria duas categorias, painel público e log privado com checkpoints; existente não cria canais', async () => {
  const f = setup(); let saves = 0;
  const config = { guildId: ids.guild, setupId: 'setup', mode: 'auto', supportRoleIds: [ids.role] };
  const result = await f.adapter.ensureStructure(config, () => saves++);
  assert.equal(f.created.length, 4); assert.equal(saves, 4);
  assert.equal(f.created.filter(item => item.type === ChannelType.GuildCategory).length, 2);
  assert.equal(f.created[2].parent, result.publicCategoryId);
  assert.equal(f.created[3].parent, result.activeCategoryId);
  assert(new PermissionsBitField(f.created[3].permissionOverwrites[0].deny).has(P.ViewChannel));
  await f.adapter.ensureStructure(config, () => saves++);
  await f.adapter.ensureStructure(f.config, () => saves++);
  assert.equal(f.created.length, 4);
  await f.adapter.validateStructure(result);
  await f.adapter.publishPanel(result);
  assert.deepEqual(f.channels.get(result.panelChannelId).sent.allowedMentions, { parse: [] });
});

test('canal privado permite somente criador/suporte/bot, bloqueio remove escrita e retry usa topic estável', async () => {
  const f = setup();
  const ticket = { id: '12345678-abcd-abcd-abcd-123456789abc', sequence: 123, guildId: ids.guild, supportRoleIds: [ids.role], creatorUserId: ids.user, reopenCount: 0 };
  ticket.channelId = await f.adapter.createTicketChannel(ticket, f.config);
  const options = f.created[0];
  assert.equal(options.name, 'ticket-000123');
  assert.equal(options.parent, ids.category);
  const overwritten = new Map(options.permissionOverwrites.map(value => [value.id, value]));
  assert(new PermissionsBitField(overwritten.get(ids.guild).deny).has(P.ViewChannel));
  for (const id of [ids.user, botId]) assert(new PermissionsBitField(overwritten.get(id).allow).has([P.ViewChannel, P.SendMessages]));
  assert(new PermissionsBitField(overwritten.get(ids.role).allow).has(P.ViewChannel));
  assert(new PermissionsBitField(overwritten.get(ids.role).deny).has(P.SendMessages));
  assert.equal(new PermissionsBitField(overwritten.get(botId).allow).has(P.ManageRoles), false);
  Object.assign(ticket, { description: 'Descrição', categoryName: 'Suporte', creatorName: 'Criador', subject: 'Assunto', status: 'OPEN' });
  await f.adapter.publishInitial(ticket);
  const initial = f.channels.get(ticket.channelId).sent;
  assert.equal(initial.content, `<@${ids.user}>`);
  assert.deepEqual(initial.allowedMentions, { parse: [], users: [ids.user] });
  assert.match(initial.embeds[0].toJSON().footer.text, /localhost:5173/);
  assert.equal(await f.adapter.createTicketChannel(ticket, f.config), ticket.channelId);
  assert.equal(f.created.length, 1);
  ticket.assignedUserId = ids.staff;
  await f.adapter.updateTicketAccess(ticket);
  const claimed = f.channels.get(ticket.channelId).permissionOverwrites.cache;
  assert(claimed.get(ids.staff).allow.has([P.ViewChannel, P.SendMessages]));
  assert(claimed.get(ids.role).deny.has(P.SendMessages));
  await f.adapter.lockChannel(ticket);
  const locked = f.channels.get(ticket.channelId).permissionOverwrites.cache;
  assert(locked.get(ids.user).deny.has(P.SendMessages));
  assert(locked.get(ids.role).deny.has(P.SendMessagesInThreads));
  assert(locked.get(ids.staff).deny.has(P.SendMessages));
  assert(locked.get(botId).allow.has(P.ManageChannels));
});

test('remoção não apaga canal com mensagens posteriores à captura e aceita canal já ausente', async () => {
  const f = setup();
  const ticket = { id: 'id', sequence: 1, guildId: ids.guild, supportRoleIds: [ids.role], creatorUserId: ids.user, reopenCount: 0,
    closing: { transcript: { lastMessageId: '1' } } };
  ticket.channelId = await f.adapter.createTicketChannel(ticket, f.config);
  const channel = f.channels.get(ticket.channelId);
  channel.messages = { fetch: async () => new Collection([['2', { id: '2' }]]) };
  await assert.rejects(f.adapter.removeChannel(ticket), /posteriores/);
  assert.equal(channel.deleted, undefined);
  channel.messages.fetch = async () => new Collection([['1', { id: '1' }]]);
  assert.equal(await f.adapter.removeChannel(ticket), true);
  assert.equal(channel.deleted, true);
  assert.equal(await f.adapter.removeChannel(ticket), false);
});

test('delete valida guild, ID, tipo e topic com ticket/ciclo antes de alterar ou apagar canal', async t => {
  const { logger } = require('../src/lib/logger');
  const logs = [];
  t.mock.method(logger, 'warn', (event, data) => logs.push({ event, data }));
  for (const mutation of [{ guildId: ids.otherGuild }, { id: ids.panel }, { type: ChannelType.GuildCategory },
    { topic: null }, { topic: 'cylbot-ticket:outro-ticket:0' }, { topic: 'cylbot-ticket:id:1' }]) {
    const f = setup();
    const ticket = { id: 'id', sequence: 1, guildId: ids.guild, supportRoleIds: [ids.role], creatorUserId: ids.user,
      reopenCount: 0, closing: { transcript: { lastMessageId: '1' } } };
    ticket.channelId = await f.adapter.createTicketChannel(ticket, f.config);
    const channel = f.channels.get(ticket.channelId);
    const overwrites = channel.rawOverwrites;
    Object.assign(channel, mutation);
    await assert.rejects(f.adapter.removeChannel(ticket), { statusCode: 409, code: 'TICKET_CHANNEL_MISMATCH' });
    assert.equal(channel.deleted, undefined);
    assert.equal(channel.rawOverwrites, overwrites);
    assert(f.channels.has(ids.panel));
    assert(f.channels.has(ids.log));
  }
  assert.equal(logs.length, 6);
  assert(logs.every(log => log.event === 'ticket.channel.inconsistent'));
});

test('delete rejeita ID ausente e propaga falha Discord sem fingir canal inexistente', async () => {
  const f = setup();
  await assert.rejects(f.adapter.removeChannel({ guildId: ids.guild }), { statusCode: 409 });
  const ticket = { guildId: ids.guild, channelId: 'missing' };
  f.guild.channels.fetch = async () => { throw Object.assign(new Error('Unknown Channel'), { code: 10003 }); };
  assert.equal(await f.adapter.removeChannel(ticket), false);
  f.guild.channels.fetch = async () => { throw Object.assign(new Error('Missing Permissions'), { code: 50013 }); };
  await assert.rejects(f.adapter.removeChannel(ticket), { code: 50013 });
});

test('adapter coleta só campos de transcript e usa paginação REST sem tokens/objetos internos', async () => {
  const f = setup(); let received;
  const channel = f.channels.get(ids.panel);
  channel.messages = { fetch: async options => { received = options; return new Collection([['10', {
    id: '10', author: { id: ids.user, username: 'Autor', token: 'não copiar' }, createdAt: new Date(0), content: 'Texto',
    embeds: [{ title: 'Título', description: 'Descrição', fields: [{ name: 'Campo', value: 'Valor' }] }],
    attachments: new Collection([['file', { name: 'file.txt', size: 1, url: 'https://cdn.discordapp.com/file.txt' }]]),
    client: { token: 'não copiar' },
  }]]); } };
  const messages = await f.adapter.fetchMessages(ids.guild, ids.panel, { before: '11', limit: 100 });
  assert.deepEqual(received, { before: '11', limit: 100, cache: false });
  assert(!JSON.stringify(messages).includes('não copiar'));
  assert.equal(messages[0].embeds[0], 'Título\nDescrição\nCampo: Valor');
});

test('adapter publica Message Core como transporte, identifica Web/IA e mantém autoria fora do webhook', async () => {
  const f = setup();
  const ticket = { id: '12345678-abcd-abcd-abcd-123456789abc', sequence: 123, guildId: ids.guild,
    supportRoleIds: [ids.role], creatorUserId: ids.user, reopenCount: 0, logChannelId: ids.log };
  ticket.channelId = await f.adapter.createTicketChannel(ticket, f.config);
  const web = await f.adapter.publishTicketMessage(ticket, { id: 'message-core-1', authorName: 'Member', authorType: 'USER',
    visibility: 'PUBLIC', content: 'Olá pela Web' });
  assert.equal(web.channelId, ticket.channelId);
  assert.match(f.channels.get(ticket.channelId).sent.content, /Member · via Web/);
  assert.deepEqual(f.channels.get(ticket.channelId).sent.allowedMentions, { parse: [] });
  const ai = await f.adapter.publishTicketMessage(ticket, { id: 'message-core-2', authorName: 'CylBot', authorType: 'AI',
    visibility: 'INTERNAL', content: 'Sugestão segura' });
  assert.equal(ai.channelId, ids.log);
  assert.match(f.channels.get(ids.log).sent.content, /Sugestão de IA/);
  assert.match(f.channels.get(ids.log).sent.content, /Revisão humana necessária/);
});

test('adapter allows only validated ticket participants as Discord mentions', async () => {
  const f = setup();
  const ticket = { id: '12345678-abcd-abcd-abcd-123456789abd', sequence: 124, guildId: ids.guild,
    supportRoleIds: [ids.role], creatorUserId: ids.user, assignedUserId: ids.staff, reopenCount: 0, logChannelId: ids.log };
  ticket.channelId = await f.adapter.createTicketChannel(ticket, f.config);
  await f.adapter.publishTicketMessage(ticket, { id: 'mention-safe', authorName: 'Member', authorType: 'USER', visibility: 'PUBLIC',
    content: `Oi <@${ids.user}> <@${ids.staff}> <@666666666666666666> @everyone @here <@&${ids.role}>` });
  assert.deepEqual(f.channels.get(ticket.channelId).sent.allowedMentions, { parse: [], users: [ids.user, ids.staff] });
});

test('estrutura automatica recria checkpoints de canais apagados e aguarda cada persistencia', async () => {
  const f = setup();
  const config = {
    guildId: ids.guild, setupId: 'setup', mode: 'auto', supportRoleIds: [ids.role],
    publicCategoryId: '100000000000000001', activeCategoryId: '100000000000000002',
    panelChannelId: '100000000000000003', logChannelId: '100000000000000004',
    panelMessageId: '100000000000000005',
  };
  let pending = false;
  const snapshots = [];
  const save = async current => {
    assert.equal(pending, false);
    pending = true;
    await Promise.resolve();
    snapshots.push(structuredClone(current));
    pending = false;
  };
  const result = await f.adapter.ensureStructure(config, save);
  assert.equal(f.created.length, 4);
  assert.equal(snapshots.length, 5);
  assert.equal(snapshots[0].publicCategoryId, null);
  assert.equal(snapshots[0].panelMessageId, null);
  assert.equal(f.created[2].parent, result.publicCategoryId);
  assert.equal(f.created[3].parent, result.activeCategoryId);
  assert(f.channels.has(result.panelChannelId));
  assert(f.channels.has(result.logChannelId));
});

test('checagem de estrutura exige categoria publica somente no modo automatico', async () => {
  const f = setup();
  assert.deepEqual(await f.adapter.missingStructure(f.config), []);
  assert.deepEqual(await f.adapter.missingStructure({ ...f.config, mode: 'auto' }), ['publicCategoryId']);
});
