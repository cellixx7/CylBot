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
  for (const id of [ids.user, ids.role, botId]) assert(new PermissionsBitField(overwritten.get(id).allow).has([P.ViewChannel, P.SendMessages]));
  assert.equal(new PermissionsBitField(overwritten.get(botId).allow).has(P.ManageRoles), false);
  assert.equal(await f.adapter.createTicketChannel(ticket, f.config), ticket.channelId);
  assert.equal(f.created.length, 1);
  await f.adapter.lockChannel(ticket);
  const locked = f.channels.get(ticket.channelId).permissionOverwrites.cache;
  assert(locked.get(ids.user).deny.has(P.SendMessages));
  assert(locked.get(ids.role).deny.has(P.SendMessagesInThreads));
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
