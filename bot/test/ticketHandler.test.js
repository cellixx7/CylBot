require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits: P, MessageFlags } = require('discord.js');
const { ticketFixture, ids } = require('./helpers/ticketFixture');
const { handleTicketInteraction } = require('../src/handlers/ticketHandler');
const { setupView, panelPayload, initialPayload, closedPayload } = require('../src/lib/ticketComponents');
const event = require('../src/events/interactionCreate');
const commands = require('../src/commands');
const { logger } = require('../src/lib/logger');

function interaction(customId, { userId = ids.user, channelId = ids.panel, kind = 'button', fields = {}, values } = {}) {
  const result = {};
  return { result, customId, guildId: ids.guild, channelId, user: { id: userId, bot: false }, values,
    isButton: () => kind === 'button', isModalSubmit: () => kind === 'modal', isChatInputCommand: () => false,
    isStringSelectMenu: () => kind === 'string', isRoleSelectMenu: () => kind === 'role', isChannelSelectMenu: () => kind === 'channel',
    fields: { getTextInputValue: key => fields[key] || '' },
    async reply(payload) { result.reply = payload; this.replied = true; },
    async deferReply(payload) { result.defer = payload; this.deferred = true; },
    async deferUpdate() { this.deferred = true; },
    async editReply(payload) { result.edit = payload; },
    async followUp(payload) { result.error = payload; },
    async showModal(payload) { result.modal = payload.toJSON(); },
  };
}
const services = f => ({ tickets: f.service, ticketSetup: f.setup });

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
  const form = interaction('ticket:open:support', { kind: 'modal', fields: { 'ticket:subject': 'Assunto', 'ticket:description': 'Descrição' } });
  await event.execute(form, bot);
  assert.match(form.result.edit.content, /Ticket #000001 aberto/);
  assert.equal(f.repository.list(ids.guild).length, 1);
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
  for (const step of ['start','role','structure','panel','log','category','categories','confirm']) {
    const view = setupView({ ...session, step });
    for (const actionRow of view.components) for (const component of actionRow.toJSON().components) {
      assert(component.custom_id.startsWith('ticket:'));
      assert(component.custom_id.length <= 100);
    }
  }
  for (const component of panelPayload().components[0].toJSON().components) assert(component.custom_id.startsWith('ticket:'));
  const ticket = await (ticketFixture(t)).create();
  ticket.closing = { reason: 'Fim', summary: '', startedAt: f.now() };
  for (const payload of [initialPayload(ticket), closedPayload(ticket)]) {
    assert.deepEqual(payload.allowedMentions, { parse: [] });
    payload.embeds[0].toJSON();
  }
});
