require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits: P, MessageFlags } = require('discord.js');
const { ticketFixture, ids } = require('./helpers/ticketFixture');
const { handleTicketInteraction, startTicketSetup } = require('../src/Ticket/handlers/ticketHandler');
const { setupView, panelPayload, initialPayload, closedPayload } = require('../src/Ticket/lib/ticketComponents');
const event = require('../src/events/interactionCreate');
const commands = require('../src/commands/index');
const { logger } = require('../src/lib/logger');
const { setTicketContext } = require('../src/Ticket/lib/ticketDiagnostics');

function interaction(customId, { userId = ids.user, channelId = ids.panel, kind = 'button', fields = {}, values } = {}) {
  const result = {};
  return { result, customId, guildId: ids.guild, channelId, user: { id: userId, bot: false }, values,
    message: { async edit(payload) { result.messageEdit = payload; } },
    isButton: () => kind === 'button', isModalSubmit: () => kind === 'modal', isChatInputCommand: () => false,
    isStringSelectMenu: () => kind === 'string', isRoleSelectMenu: () => kind === 'role', isChannelSelectMenu: () => kind === 'channel',
    fields: { getTextInputValue: key => fields[key] || '' },
    async reply(payload) { result.reply = payload; this.replied = true; },
    async deferReply(payload) { result.defer = payload; this.deferred = true; },
    async deferUpdate() { this.deferred = true; },
    async editReply(payload) { result.edit = payload; },
    async update(payload) { result.update = payload; this.replied = true; },
    async followUp(payload) { result.error = payload; },
    async showModal(payload) { result.modal = payload.toJSON(); },
  };
}
const services = f => ({ tickets: f.service, ticketSetup: f.setup });

test('claim duplicado mantém 409, mensagem clara e log warn com contexto do ticket', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  await f.service.claim(f.action(ticket));
  const logs = [];
  t.mock.method(logger, 'warn', (event, data) => logs.push({ event, data }));
  const i = interaction(`ticket:claim:${ticket.id}`, { userId: ids.staff, channelId: ticket.channelId });
  await handleTicketInteraction(i, services(f));
  assert.match(i.result.error.content, /já está sendo atendido/);
  const log = logs.find(log => log.event === 'ticket.interaction_failed').data;
  assert.equal(log.action, 'claim');
  assert.equal(log.statusCode, 409);
  assert.equal(log.errorName, 'TicketAlreadyClaimedError');
  assert.equal(log.ticketId, ticket.id);
  assert.equal(log.guildId, ids.guild);
  assert.equal(log.channelId, ticket.channelId);
  assert.equal(log.interactionChannelId, ticket.channelId);
  assert.equal(log.customIdAction, 'ticket:claim');
  assert.match(log.operationId, /^[a-f0-9-]{36}$/);
});

test('erro 500 registra classe/código/cause seguros sem conteúdo, SQL, segredo ou custom ID bruto', async t => {
  const ticketId = '12345678-abcd-abcd-abcd-123456789abc';
  const logs = [];
  t.mock.method(logger, 'error', (event, data) => logs.push({ event, data }));
  const secret = 'segredo-de-ticket-e-token';
  const cause = Object.assign(new Error(secret), { code: '23505', detail: secret, query: secret });
  const error = Object.assign(new TypeError(secret), { cause, token: secret, requestBody: { content: secret }, stack: secret });
  const i = interaction(`ticket:finish:${ticketId}`, { kind: 'modal', fields: { 'ticket:reason': secret, 'ticket:summary': secret } });
  await handleTicketInteraction(i, { tickets: { close: async () => { throw error; } } });
  const log = logs[0].data;
  assert.equal(log.action, 'close');
  assert.equal(log.customIdAction, 'ticket:finish');
  assert.equal(log.ticketId, ticketId);
  assert.equal(log.statusCode, 500);
  assert.equal(log.errorName, 'TypeError');
  assert.equal(log.causeErrorCode, '23505');
  assert(!JSON.stringify([logs, i.result]).includes(secret));
  assert(!JSON.stringify(logs).includes(i.customId));
  assert.equal(log.stack, undefined);
});

test('429 de reabertura identifica cooldown app; HTTP 429 do Discord tem origem e mensagem distintas', async t => {
  const f = ticketFixture(t); const ticket = await f.close(await f.create());
  // Faz o cooldown de fechamento ser o limitador, sem cooldown de abertura.
  f.advance();
  await f.repository.save({ ...ticket, closedAt: f.now() });
  const logs = [];
  t.mock.method(logger, 'warn', (event, data) => logs.push({ event, data }));
  const options = { userId: ids.staff, channelId: ids.log };
  const i = interaction(`ticket:reopen:${ticket.id}:0`, options);
  await handleTicketInteraction(i, services(f));
  assert.match(i.result.error.content, /60 segundos após/);
  const app = logs.at(-1).data;
  assert.equal(app.action, 'reopen');
  assert.equal(app.statusCode, 429);
  assert.equal(app.rateLimitSource, 'app');
  assert.equal(app.errorCode, 'TICKET_REOPEN_COOLDOWN');
  assert.equal(app.channelId, ticket.channelId);
  assert.equal(app.interactionChannelId, ids.log);
  f.adapter.verifyClosedLog = async () => { throw Object.assign(new Error('private payload'), { name: 'HTTPError', status: 429 }); };
  const discord = interaction(`ticket:delete:${ticket.id}:0`, options);
  await handleTicketInteraction(discord, services(f));
  const upstream = logs.at(-1).data;
  assert.equal(upstream.action, 'delete');
  assert.equal(upstream.rateLimitSource, 'discord');
  assert.equal(upstream.upstreamStatusCode, 429);
  assert.equal(upstream.statusCode, 429);
  assert.match(discord.result.error.content, /Discord limitou/);
  assert(!JSON.stringify([logs, discord.result]).includes('private payload'));
  assert(f.channels.has(ticket.channelId));
});

test('erro no fechamento preserva causa Discord e correlaciona log técnico com interação', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  const logs = [];
  t.mock.method(logger, 'error', (event, data) => logs.push({ event, data }));
  f.adapter.lockChannel = async () => {
    throw Object.assign(new Error('payload privado'), { name: 'DiscordAPIError[50013]', code: 50013, status: 403 });
  };
  const i = interaction(`ticket:finish:${ticket.id}`, { userId: ids.staff, channelId: ticket.channelId,
    kind: 'modal', fields: { 'ticket:reason': 'Resolvido' } });
  await handleTicketInteraction(i, services(f));
  const technical = logs.find(log => log.event === 'ticket.close.failed').data;
  const failure = logs.find(log => log.event === 'ticket.interaction_failed').data;
  assert.equal(technical.errorCode, 50013);
  assert.equal(failure.causeErrorCode, 50013);
  assert.equal(failure.stage, 'discord.lockChannel');
  assert.equal(failure.statusCode, 503);
  assert.equal(failure.operationId, technical.operationId);
  assert(!JSON.stringify(logs).includes('payload privado'));
  assert(f.channels.has(ticket.channelId));
});

test('operações simultâneas não misturam contexto e falha ao responder mantém diagnóstico seguro', async t => {
  const logs = [];
  t.mock.method(logger, 'error', (event, data) => logs.push({ event, data }));
  t.mock.method(logger, 'warn', (event, data) => logs.push({ event, data }));
  const idsToTest = ['12345678-abcd-abcd-abcd-123456789abc', '22345678-abcd-abcd-abcd-123456789abc'];
  const interactions = idsToTest.map(id => interaction(`ticket:claim:${id}`));
  interactions[0].followUp = async () => { throw Object.assign(new Error('token privado'), { name: 'DiscordAPIError[10062]', code: 10062 }); };
  await Promise.all(interactions.map(i => handleTicketInteraction(i, { tickets: { claim: async input => {
    setTicketContext({ id: input.ticketId, channelId: input.ticketId === idsToTest[0] ? ids.panel : ids.log });
    await new Promise(resolve => setImmediate(resolve));
    throw new Error('conteúdo privado');
  } } })));
  const failures = logs.filter(log => log.event === 'ticket.interaction_failed').map(log => log.data);
  assert.equal(new Set(failures.map(log => log.operationId)).size, 2);
  assert.equal(failures.find(log => log.ticketId === idsToTest[0]).channelId, ids.panel);
  assert.equal(failures.find(log => log.ticketId === idsToTest[1]).channelId, ids.log);
  const response = logs.find(log => log.event === 'ticket.interaction_response_failed').data;
  assert.equal(response.errorCode, 10062);
  assert.equal(response.operationId, failures.find(log => log.ticketId === idsToTest[0]).operationId);
  assert(!JSON.stringify(logs).includes('privado'));
});

test('setup com interação já reconhecida não propaga erro SDK nem payload para o handler global', async t => {
  const logs = [];
  t.mock.method(logger, 'error', (event, data) => logs.push({ event, data }));
  t.mock.method(logger, 'warn', (event, data) => logs.push({ event, data }));
  const error = Object.assign(new Error('Interaction has already been acknowledged.'), {
    name: 'DiscordAPIError[40060]', code: 40060, status: 400,
    url: 'https://discord.com/api/interactions/id/SECRET/callback', requestBody: { content: 'PRIVATE' },
  });
  const i = interaction(undefined, { userId: ids.admin });
  i.deferReply = i.reply = async () => { throw error; };
  await assert.doesNotReject(startTicketSetup(i, {}));
  assert.equal(logs[0].data.action, 'setup.begin');
  assert.equal(logs[0].data.errorCode, 40060);
  assert.equal(logs[1].event, 'ticket.interaction_response_failed');
  assert.equal(logs[0].data.operationId, logs[1].data.operationId);
  assert(!/SECRET|PRIVATE|callback|requestBody/.test(JSON.stringify(logs)));
});

test('/ticket é guild-only, exige ManageGuild no registro e revalida no service', async t => {
  const f = ticketFixture(t, { configured: false });
  const command = commands.find(command => command.data.name === 'ticket');
  const data = command.data.toJSON();
  assert.equal(data.dm_permission, false);
  assert.equal(data.default_member_permissions, P.ManageGuild.toString());
  const denied = interaction(undefined); denied.client = { services: services(f) };
  await command.execute(denied);
  assert.match(denied.result.error.content, /Gerenciar Servidor/);
  const allowed = interaction(undefined, { userId: ids.admin }); allowed.client = denied.client;
  await command.execute(allowed);
  assert.equal(allowed.result.defer.flags, MessageFlags.Ephemeral);
  assert.match(allowed.result.edit.content, /CONFIGURAÇÃO/);
  assert.equal(allowed.result.edit.components[0].toJSON().components[0].custom_id.startsWith('ticket:setup:start:'), true);
});

test('registry despacha ticket; painel → categoria → modal → canal usa services injetados', async t => {
  const f = ticketFixture(t); const bot = { services: services(f), commands };
  const open = interaction('ticket:create');
  await event.execute(open, bot);
  assert.equal(open.result.defer.flags, MessageFlags.Ephemeral);
  assert.equal(open.result.edit.components[0].toJSON().components[0].custom_id, 'ticket:category');
  const category = interaction('ticket:category', { kind: 'string', values: ['support'] });
  await event.execute(category, bot);
  assert.equal(category.result.modal.custom_id, 'ticket:open:support');
  assert.equal(category.result.messageEdit.components.length, 0);
  const form = interaction('ticket:open:support', { kind: 'modal', fields: { 'ticket:subject': 'Assunto', 'ticket:description': 'Descrição' } });
  await event.execute(form, bot);
  assert.match(form.result.edit.content, /Ticket #000001 aberto/);
  assert.equal(f.repository.list(ids.guild).length, 1);

  const repeated = interaction('ticket:create');
  await event.execute(repeated, bot);
  assert.match(repeated.result.edit.content, new RegExp(`<#${f.repository.list(ids.guild)[0].channelId}>`));
  const another = interaction('ticket:existing:new');
  await event.execute(another, bot);
  assert.equal(another.result.update.components[0].toJSON().components[0].custom_id, 'ticket:category:new');
  const secondCategory = interaction('ticket:category:new', { kind: 'string', values: ['support'] });
  await event.execute(secondCategory, bot);
  assert.equal(secondCategory.result.modal.custom_id, 'ticket:open:support:new');
  const secondForm = interaction('ticket:open:support:new', { kind: 'modal', fields: { 'ticket:subject': 'Outro assunto', 'ticket:description': 'Outra necessidade' } });
  await event.execute(secondForm, bot);
  assert.equal(f.repository.list(ids.guild).length, 2);
});

test('handler passa por claim, modal de fechamento, log, confirmação de remoção e reabertura', async t => {
  const f = ticketFixture(t); const ticket = await f.create(); const deps = services(f);
  const base = { userId: ids.staff, channelId: ticket.channelId };
  const claim = interaction(`ticket:claim:${ticket.id}`, base);
  await handleTicketInteraction(claim, deps); assert.match(claim.result.edit.content, /assumiu/);
  const close = interaction(`ticket:close:${ticket.id}`, base);
  await handleTicketInteraction(close, deps); assert.equal(close.result.modal.custom_id, `ticket:finish:${ticket.id}`);
  const finish = interaction(close.result.modal.custom_id, { ...base, kind: 'modal', fields: { 'ticket:reason': 'Resolvido', 'ticket:summary': 'Solução' } });
  await handleTicketInteraction(finish, deps); assert.match(finish.result.edit.content, /encerrado e transcrito/);
  const remove = interaction(`ticket:remove:${ticket.id}:0`, { userId: ids.staff, channelId: ids.log });
  await handleTicketInteraction(remove, deps); assert(f.channels.has(ticket.channelId));
  const confirm = interaction(remove.result.reply.components[0].toJSON().components[0].custom_id, { userId: ids.staff, channelId: ids.log });
  await handleTicketInteraction(confirm, deps); assert.equal(f.channels.size, 0);
  f.advance();
  const reopen = interaction(`ticket:reopen:${ticket.id}:0`, { userId: ids.staff, channelId: ids.log });
  await handleTicketInteraction(reopen, deps); assert.match(reopen.result.edit.content, /reaberto/);
});

test('custom IDs inválidos, outro contexto e tipos errados não executam ações; erros SDK são genéricos', async t => {
  const f = ticketFixture(t); const deps = services(f);
  assert.equal(await handleTicketInteraction(interaction('other:create'), deps), false);
  for (const id of ['ticket:', 'ticket:claim:other', 'ticket:open:../../x', 'ticket:reopen:bad:1', 'ticket:create:extra']) {
    const i = interaction(id); await handleTicketInteraction(i, deps);
    assert.match(i.result.reply.content, /inválido|desatualizado/);
  }
  const wrongType = interaction('ticket:open:support'); await handleTicketInteraction(wrongType, deps);
  assert.match(wrongType.result.reply.content, /inválido/);
  const dm = interaction('ticket:create'); dm.guildId = null; await handleTicketInteraction(dm, deps);
  assert.match(dm.result.reply.content, /servidor/);
  const logs = [];
  t.mock.method(logger, 'error', (event, data) => logs.push({ event, data }));
  f.adapter.getActor = async () => { throw new Error('secret-private-ticket-description'); };
  const failed = interaction('ticket:create'); await handleTicketInteraction(failed, deps);
  assert(!JSON.stringify([failed.result, logs]).includes('secret-private-ticket-description'));
  assert.equal(f.channels.size, 0);
});

test('wizard expõe componentes válidos com namespace, selects tipados e até cinco categorias', async t => {
  const f = ticketFixture(t, { configured: false });
  const session = await f.setup.begin({ guildId: ids.guild, userId: ids.admin });
  for (const step of ['resume','start','role','structure','panel','log','category','categories','confirm']) {
    const view = setupView({ ...session, step });
    for (const actionRow of view.components) for (const component of actionRow.toJSON().components) {
      assert(component.custom_id.startsWith('ticket:'));
      assert(component.custom_id.length <= 100);
    }
  }
  for (const component of panelPayload().components[0].toJSON().components) assert(component.custom_id.startsWith('ticket:'));
  const ticket = await (ticketFixture(t)).create();
  const openActions = initialPayload(ticket).components[0].toJSON().components;
  assert(openActions.some(component => component.custom_id.startsWith('ticket:claim:')));
  ticket.assignedUserId = ids.staff;
  const claimedActions = initialPayload(ticket).components[0].toJSON().components;
  assert.equal(claimedActions.some(component => component.custom_id.startsWith('ticket:claim:')), false);
  ticket.closing = { reason: 'Fim', summary: '', startedAt: f.now() };
  for (const payload of [initialPayload(ticket), closedPayload(ticket)]) {
    assert.deepEqual(payload.allowedMentions, { parse: [] });
    payload.embeds[0].toJSON();
  }
});

test('seletor abre o modal mesmo quando a mensagem efemera original ja foi removida', async t => {
  const f = ticketFixture(t);
  const logs = [];
  t.mock.method(logger, 'warn', (event, data) => logs.push({ event, data }));
  const selected = interaction('ticket:category', { kind: 'string', values: ['support'] });
  selected.message.edit = async () => {
    throw Object.assign(new Error('Unknown Message'), { name: 'DiscordAPIError[10008]', code: 10008, status: 404 });
  };
  await handleTicketInteraction(selected, services(f));
  assert.equal(selected.result.modal.custom_id, 'ticket:open:support');
  assert.equal(selected.result.error, undefined);
  const warning = logs.find(log => log.event === 'ticket.source_message_update_failed');
  assert.equal(warning.data.action, 'category');
  assert.equal(warning.data.stage, 'interaction.source_message');
  assert.equal(warning.data.errorCode, 10008);
});
