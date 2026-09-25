require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const OpenRouterService = require('../src/services/openRouterService');
const { OUTPUT_SCHEMA } = require('../src/Ticket/services/ticketAIContract');
const { loadEnv } = require('../src/config/env');

test('provider de tickets usa cliente compartilhado, schema estrito, sem tools e usage limitado', async () => {
  const provider = new OpenRouterService({ apiKey: 'synthetic', model: 'base', maxTokens: 800 });
  const calls = [];
  provider.client = { chat: { completions: { create: async (body, options) => {
    calls.push({ body, options }); return { choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 100, completion_tokens: 30 } };
  } } } };
  const result = await provider.generateTicket({ messages: [{ role: 'system', content: 'policy' }], schema: OUTPUT_SCHEMA, model: 'ticket-model', timeoutMs: 1000 });
  assert.equal(result.raw, '{}'); assert.equal(result.inputTokens, 100); assert.equal(result.outputTokens, 30);
  assert.equal(calls[0].body.tools, undefined); assert.equal(calls[0].body.response_format.json_schema.strict, true);
  assert.equal(calls[0].body.model, 'ticket-model'); assert.equal(calls[0].body.max_tokens, 700);
  assert.equal(calls[0].options.maxRetries, 0); assert.equal(calls[0].options.timeout, 1000);
  assert(calls[0].options.signal instanceof AbortSignal);
});

test('timeout aborta requisição do provider sem chamar OpenRouter real', async () => {
  const provider = new OpenRouterService({ apiKey: 'synthetic' });
  provider.client = { chat: { completions: { create: (body, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) } } };
  const keepAlive = setTimeout(() => {}, 500);
  try { await assert.rejects(provider.generateTicket({ messages: [], schema: OUTPUT_SCHEMA, model: 'test', timeoutMs: 10 }), { name: 'TimeoutError' }); }
  finally { clearTimeout(keepAlive); }
});

test('config centraliza modelo, opt-in e timeout com default seguro', () => {
  const base = loadEnv({}, { requireDiscord: false });
  assert.equal(base.ticketAI.enabled, false); assert.deepEqual(base.ticketAI.guildIds, []);
  assert.equal(base.ticketAI.allowAllGuilds, true);
  assert.equal(base.ticketAI.model, base.openRouter.model);
  const explicit = loadEnv({ OPENROUTER_MODEL: 'shared-model', TICKET_AI_MODEL: 'special-model', TICKET_AI_GUILD_IDS: '123, 456', TICKET_AI_ENABLED: 'true' }, { requireDiscord: false });
  assert.equal(explicit.ticketAI.model, 'special-model'); assert.equal(explicit.ticketAI.enabled, true);
  assert.equal(explicit.ticketAI.allowAllGuilds, false);
  assert.deepEqual(explicit.ticketAI.guildIds, ['123', '456']);
  const local = loadEnv({ DATABASE_URL: 'postgresql://test:test@localhost/test', OPENROUTER_API_KEY: 'synthetic' }, { requireDiscord: false });
  assert.equal(local.ticketAI.enabled, true); assert.deepEqual(local.ticketAI.guildIds, []); assert.equal(local.ticketAI.allowAllGuilds, true);
  const production = loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://test:test@localhost/test', OPENROUTER_API_KEY: 'synthetic', TICKET_AI_ENABLED: 'true' }, { requireDiscord: false });
  assert.equal(production.ticketAI.allowAllGuilds, false);
  assert.throws(() => loadEnv({ TICKET_AI_TIMEOUT_MS: '30001' }, { requireDiscord: false }));
});
