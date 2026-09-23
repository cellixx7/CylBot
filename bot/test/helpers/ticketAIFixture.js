const { randomUUID } = require('node:crypto');
const { ticketFixture, ids } = require('./ticketFixture');
const { TicketAIService } = require('../../src/Ticket/services/ticketAIService');
const { TicketAIContextService } = require('../../src/Ticket/services/ticketAIContextService');
const { TicketAIPolicyService } = require('../../src/Ticket/services/ticketAIPolicyService');
const { TicketAIActionService } = require('../../src/Ticket/services/ticketAIActionService');
const { DEFAULT_CONFIG } = require('../../src/Ticket/services/ticketAIContract');
const { TicketMessageService } = require('../../src/Ticket/services/ticketMessageService');

async function ticketAIFixture(t) {
  const core = ticketFixture(t);
  const ticket = await core.create();
  let time = Date.now();
  const now = () => time;
  const settings = { enabled: true, guildIds: [ids.guild], model: 'test-model', timeoutMs: 100 };
  let config = { ...DEFAULT_CONFIG, enabled: true, autonomyLevel: 2 };
  const states = new Map(); const runs = [];
  let tail = Promise.resolve();
  const repository = {
    async getConfig() { return structuredClone(config); },
    async saveConfig(guildId, value) { config = structuredClone(value); return config; },
    async getState(guildId, id) { return structuredClone(states.get(id) || { paused: false, escalatedAt: null }); },
    async locked(guildId, id, callback) {
      const before = tail; let release;
      tail = new Promise(resolve => { release = resolve; });
      await before;
      try {
        const current = await core.service.ticket(guildId, id);
        if (!states.has(id)) states.set(id, { paused: false, escalatedAt: null });
        const state = states.get(id);
        return await callback({ ticket: current, config: structuredClone(config), state: structuredClone(state), tx: undefined,
          patch: async changes => Object.assign(state, changes),
          audit: async values => { runs.push({ id: randomUUID(), guildId, ticketId: id, ...values }); },
        });
      } finally { release(); }
    },
    async reserve({ guildId, ticketId, runId, messageId, now, audit }) {
      return this.locked(guildId, ticketId, async ({ state, patch, audit: insert }) => {
        if (state.leaseExpiresAt > now || state.lastRunAt && now - state.lastRunAt < 15000 || messageId && state.lastMessageId === messageId) return false;
        await patch({ leaseId: runId, leaseExpiresAt: new Date(now + 60000), lastRunAt: new Date(now), lastMessageId: messageId });
        await insert({ id: runId, ...audit, status: 'requested' }); return true;
      });
    },
    async finish(guildId, ticketId, runId, values) {
      Object.assign(runs.find(run => run.id === runId), values);
      const state = states.get(ticketId);
      if (state.leaseId === runId) Object.assign(state, { leaseId: null, leaseExpiresAt: null });
    },
  };
  const sent = []; const suggestions = []; const handoffs = [];
  const messages = [{ id: randomUUID(), ticketId: ticket.id, guildId: ticket.guildId, authorDiscordId: ids.user,
    authorName: 'Criador', authorType: 'USER', origin: 'DISCORD', visibility: 'PUBLIC', content: 'Preciso de ajuda',
    deliveryStatus: 'SENT', deliveryAttempts: 0, createdAt: time, updatedAt: time }];
  const messageRepository = {
    async create(value) {
      const existing = messages.find(item => item.id === value.id || value.clientMessageId && item.ticketId === value.ticketId && item.clientMessageId === value.clientMessageId
        || value.discordMessageId && item.guildId === value.guildId && item.discordMessageId === value.discordMessageId);
      if (existing) return { message: existing, duplicate: true };
      const message = { id: value.id || randomUUID(), createdAt: time, updatedAt: time, deliveryAttempts: 0, ...value };
      messages.push(message); return { message, duplicate: false };
    },
    async findById(guildId, id) { return messages.find(item => item.guildId === guildId && item.id === id) || null; },
    async findByClientMessageId(ticketId, id) { return messages.find(item => item.ticketId === ticketId && item.clientMessageId === id) || null; },
    async findByDiscordMessageId(guildId, id) { return messages.find(item => item.guildId === guildId && item.discordMessageId === id) || null; },
    async hasLegacySyncBoundary() { return true; },
    async importMany(values) { let imported = 0; for (const value of values) { const result = await this.create(value); if (!result.duplicate) imported++; } return imported; },
    async listRecent(ticketId, { limit }) { return messages.slice(-limit).map(item => ({ ...item, authorType: item.authorType || item.source, visibility: item.visibility || 'PUBLIC' })); },
    async listPage(ticketId, { limit, visibilities }) { const list = messages.filter(item => item.ticketId === ticketId && visibilities.includes(item.visibility || 'PUBLIC')).slice(-limit); return { messages: list, nextBefore: null }; },
    async listForTranscript(ticketId, { limit }) { return messages.filter(item => item.ticketId === ticketId && (item.visibility || 'PUBLIC') === 'PUBLIC').slice(0, limit); },
    async startDelivery(guildId, id) { const item = await this.findById(guildId, id); if (!item || !['PENDING', 'FAILED'].includes(item.deliveryStatus)
      && !(item.deliveryStatus === 'SENDING' && item.updatedAt < Date.now() - 60000)) return null;
      Object.assign(item, { deliveryStatus: 'SENDING', deliveryAttempts: item.deliveryAttempts + 1, updatedAt: Date.now() }); return { ...item }; },
    async markDelivered(guildId, id, attempt, value) { const item = await this.findById(guildId, id);
      if (!item || item.deliveryStatus !== 'SENDING' || item.deliveryAttempts !== attempt) return null;
      Object.assign(item, value, { deliveryStatus: 'SENT', updatedAt: Date.now() }); return item; },
    async markFailed(guildId, id, attempt, code) { const item = await this.findById(guildId, id);
      if (!item || item.deliveryStatus !== 'SENDING' || item.deliveryAttempts !== attempt) return null;
      Object.assign(item, { deliveryStatus: 'FAILED', deliveryErrorCode: code, updatedAt: Date.now() }); return item; },
  };
  Object.assign(core.adapter, {
    async publishTicketMessage(ticket, message) {
      if (message.visibility === 'INTERNAL') suggestions.push(message.content); else sent.push(message.content);
      return { id: String(100000000000000010n + BigInt(sent.length + suggestions.length)), channelId: message.visibility === 'INTERNAL' ? ids.log : ticket.channelId };
    },
    async aiHandoffStaff(ticket) { handoffs.push(ticket.id); },
  });
  const messageService = new TicketMessageService({ repository: messageRepository, tickets: core.service,
    permissions: core.permissions, adapter: core.adapter });
  core.repository.findByChannelId = async (guildId, channelId) => core.repository.list(guildId).find(ticket => ticket.channelId === channelId);
  const proposal = { message: 'Posso ajudar.', action: 'REPLY', confidence: 0.9, reason: 'user_question_answered', requiresHuman: false };
  const requests = [];
  const provider = { generateTicket: async input => { requests.push(input); return { raw: JSON.stringify(proposal), inputTokens: 123, outputTokens: 45 }; } };
  const policy = new TicketAIPolicyService(settings);
  const actions = new TicketAIActionService({ repository, adapter: core.adapter, policy, permissions: core.permissions, messages: messageService });
  const makeService = () => new TicketAIService({ repository, tickets: core.service, provider, context: new TicketAIContextService(messageService),
    policy, actions, settings, now });
  const ai = makeService();
  const input = { guildId: ids.guild, ticketId: ticket.id, channelId: ticket.channelId, userId: ids.user, messageId: '100000000000000003', content: 'Ajuda', bot: false };
  return { core, ticket, ai, settings, repository, states, runs, sent, suggestions, handoffs, messages, messageRepository, messageService, proposal, requests, provider,
    makeService, input, send: overrides => ai.onMessage({ ...input, ...overrides }),
    configure: changes => ai.configure({ guildId: ids.guild, userId: ids.admin, config: { ...config, ...changes } }),
    advance(ms = 16000) { time += ms; }, pause: paused => ai.pause({ guildId: ids.guild, ticketId: ticket.id, userId: ids.staff, paused }) };
}
module.exports = { ticketAIFixture, ids };
