require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TicketAIMessageHandler } = require('../src/Ticket/handlers/ticketAIMessageHandler');
const { handleTicketAIInteraction, startTicketAIConfig } = require('../src/Ticket/handlers/ticketAIHandler');
const messageEvent = require('../src/events/messageCreate');
const messageUpdateEvent = require('../src/events/messageUpdate');
const { ticketAIFixture, ids } = require('./helpers/ticketAIFixture');

test('messageCreate ignora bots, DMs, webhooks e mensagens de sistema', () => {
  const seen = []; const client = { services: { ticketMessageInbound: { handle: value => seen.push(value) } } };
  const message = { guildId: ids.guild, channelId: ids.panel, author: { id: ids.user, bot: false }, content: 'hi', id: 'm' };
  for (const override of [{ guildId: null }, { author: { bot: true } }, { webhookId: 'hook' }, { system: true }]) messageEvent.execute({ ...message, ...override }, client);
  assert.equal(seen.length, 0); messageEvent.execute(message, client); assert.equal(seen.length, 1);
});

test('messageUpdate encaminha somente campos seguros e resolve partial', async () => {
  const seen = [];
  const client = { services: { ticketMessageInbound: { handleUpdate: value => seen.push(value) } } };
  const message = { guildId: ids.guild, channelId: ids.panel, id: '100000000000000001', author: { id: ids.user, bot: false },
    content: 'Atualizada', editedTimestamp: 10, system: false };
  await messageUpdateEvent.execute({}, message, client);
  assert.deepEqual(seen, [{ guildId: ids.guild, channelId: ids.panel, messageId: message.id, userId: ids.user, content: 'Atualizada', editedAt: 10 }]);
  await messageUpdateEvent.execute({}, { partial: true, async fetch() { return { ...message, guildId: null }; } }, client);
  assert.equal(seen.length, 1);
});

test('debounce combina sequência em uma geração e pedido de humano é imediato', async t => {
  const seen = []; const handler = new TicketAIMessageHandler({ repository: {}, onMessage: async value => seen.push(value) }, { debounceMs: 15 });
  t.after(() => handler.stop());
  const base = { guildId: ids.guild, channelId: ids.panel, userId: ids.user };
  for (const content of ['oi', 'meu problema', 'é que...']) handler.enqueue({ ...base, content });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(seen.length, 1); assert.equal(seen[0].content, 'é que...');
  handler.enqueue({ ...base, content: 'oi' });
  await handler.enqueue({ ...base, content: 'quero falar com atendente' });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(seen.length, 2); assert.equal(handler.pending.size, 0);
});

function interaction(customId, userId = ids.staff) {
  const result = {};
  return { result, customId, guildId: ids.guild, user: { id: userId }, channelId: null,
    isButton: () => true, isModalSubmit: () => false,
    async deferReply() { this.deferred = true; }, async reply(p) { result.reply = p; },
    async editReply(p) { result.reply = p; }, async followUp(p) { result.error = p; },
    async showModal(p) { result.modal = p.toJSON(); } };
}

test('configuração Discord abre modal válido; controles permitem staff e recusam usuário comum', async t => {
  const f = await ticketAIFixture(t); const services = { tickets: f.core.service, ticketAI: f.ai };
  const admin = interaction(undefined, ids.admin); admin.client = { services };
  await startTicketAIConfig(admin);
  assert.equal(admin.result.modal.custom_id, 'ticket:ai:config'); assert.equal(admin.result.modal.components.length, 5);
  for (const [user, allowed] of [[ids.staff, true], [ids.user, false]]) {
    const i = interaction(`ticket:ai:pause:${f.ticket.id}`, user); i.channelId = f.ticket.channelId;
    await handleTicketAIInteraction(i, services);
    assert.equal(Boolean(i.result.error), !allowed);
  }
  assert.equal((await f.repository.getState(ids.guild, f.ticket.id)).paused, true);
});
