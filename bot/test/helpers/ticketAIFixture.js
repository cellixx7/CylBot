const { randomUUID } = require('node:crypto');
const { ticketFixture, ids } = require('./ticketFixture');
const { TicketAIService } = require('../../src/services/ticketAIService');
const { TicketAIContextService } = require('../../src/services/ticketAIContextService');
const { TicketAIPolicyService } = require('../../src/services/ticketAIPolicyService');
const { TicketAIActionService } = require('../../src/services/ticketAIActionService');
const { DEFAULT_CONFIG } = require('../../src/services/ticketAIContract');

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
        return await callback({ ticket: current, config: structuredClone(config), state: structuredClone(state),
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
  const messages = [{ source: 'USER', content: 'Preciso de ajuda' }];
  Object.assign(core.adapter, { aiMessages: async () => messages, aiReply: async (ticket, cfg, text) => sent.push(text),
    aiSuggestion: async (ticket, proposal) => suggestions.push(proposal), aiHandoff: async ticket => handoffs.push(ticket.id) });
  core.repository.findByChannelId = async (guildId, channelId) => core.repository.list(guildId).find(ticket => ticket.channelId === channelId);
  const proposal = { message: 'Posso ajudar.', action: 'REPLY', confidence: 0.9, reason: 'user_question_answered', requiresHuman: false };
  const requests = [];
  const provider = { generateTicket: async input => { requests.push(input); return { raw: JSON.stringify(proposal), inputTokens: 123, outputTokens: 45 }; } };
  const policy = new TicketAIPolicyService(settings);
  const actions = new TicketAIActionService({ repository, adapter: core.adapter, policy, permissions: core.permissions });
  const makeService = () => new TicketAIService({ repository, tickets: core.service, provider, context: new TicketAIContextService(core.adapter),
    policy, actions, settings, now });
  const ai = makeService();
  const input = { guildId: ids.guild, channelId: ticket.channelId, userId: ids.user, messageId: '100000000000000003', content: 'Ajuda', bot: false };
  return { core, ticket, ai, settings, repository, states, runs, sent, suggestions, handoffs, messages, proposal, requests, provider,
    makeService, input, send: overrides => ai.onMessage({ ...input, ...overrides }),
    configure: changes => ai.configure({ guildId: ids.guild, userId: ids.admin, config: { ...config, ...changes } }),
    advance(ms = 16000) { time += ms; }, pause: paused => ai.pause({ guildId: ids.guild, ticketId: ticket.id, userId: ids.staff, paused }) };
}
module.exports = { ticketAIFixture, ids };
