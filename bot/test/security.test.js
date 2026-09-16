require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const { loadEnv } = require('../src/config/env');
const { createRequestHandler } = require('../src/api/server');
const { RateLimiter } = require('../src/api/http/rateLimit');
const { readJson } = require('../src/api/http/json');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { AuthService } = require('../src/services/authService');
const { DashboardService } = require('../src/services/dashboardService');
const { AnnouncementService } = require('../src/services/announcementService');
const OpenRouterService = require('../src/services/openRouterService');
const { logger } = require('../src/lib/logger');

const guildId = '123456789012345678';
const channelId = '234567890123456789';
const otherGuildId = '345678901234567890';
const secret = 'synthetic-private-token';
const sendInput = { channelId, outputType: 'content', generated: { content: 'Mensagem' } };

function setup(t) {
  let time = 1000;
  const now = () => time;
  const config = { ...loadEnv({}, { requireDiscord: false }).auth, enabled: true };
  const sessions = new AuthSessionManager({ now });
  const makeSession = (id = 'user') => sessions.create({ id }, { access_token: secret, expires_in: 3600, scope: 'identify guilds' });
  const session = makeSession();
  const counts = { ai: 0, fetch: 0, guilds: 0, saved: 0 };
  const sent = [];
  let permissions = new PermissionsBitField([P.ViewChannel, P.SendMessages, P.SendMessagesInThreads]);
  const channel = { id: channelId, guildId, isTextBased: () => true, isThread: () => false,
    permissionsFor: () => permissions, send: async payload => { sent.push(payload); } };
  const memberships = [{ id: guildId, name: 'Guild', permissions: '32', owner: false, icon: null }];
  const provider = { authorizationUrl: state => `https://discord.com/oauth2/authorize?state=${state}`,
    getCurrentUserGuilds: async token => { assert.equal(token, secret); counts.guilds++; return memberships; } };
  const client = { user: { id: 'bot' }, isReady: () => true,
    guilds: { cache: new Map([[guildId, { id: guildId, name: 'Guild' }]]) },
    channels: { fetch: async () => { counts.fetch++; return channel; } } };
  const store = new Map();
  const announcements = new AnnouncementService({ getCategories: id => store.get(id), saveCategories: (id, categories) => { counts.saved++; store.set(id, categories); } },
    { generate: async () => { counts.ai++; return { content: 'Anúncio' }; } });
  const auth = new AuthService({ config, sessions, provider, now });
  const services = { auth, announcements, dashboard: new DashboardService({ provider, client, now }),
    openRouter: new OpenRouterService(loadEnv({}, { requireDiscord: false }).openRouter),
    textaAI: { generate: async () => { counts.ai++; return { content: 'Texto' }; } } };
  const logs = [];
  for (const level of ['error','warn','info']) t.mock.method(logger, level, (event, fields) => logs.push({ event, ...fields }));
  const limiter = new RateLimiter({ now });
  const handler = createRequestHandler({ client, services, rateLimiter: limiter });
  async function request(path, { method = 'POST', body = {}, authenticated = true, as = session, origin = config.webOrigin, headers = {} } = {}) {
    const input = Object.assign(Readable.from([JSON.stringify(body)]), { method, url: path,
      headers: { ...(authenticated ? { cookie: `cylbot_session=${as.id}` } : {}), ...(origin !== null ? { origin } : {}), ...headers },
      socket: { remoteAddress: '127.0.0.1' } });
    const response = { headers: {}, setHeader(k,v) { this.headers[k]=v; },
      writeHead(status, h = {}) { this.status=status; Object.assign(this.headers,h); return this; },
      end(value) { this.body = value ? JSON.parse(value) : undefined; } };
    await handler(input, response);
    return response;
  }
  return { request, counts, sent, logs, memberships, channel, client, session, services, makeSession, limiter,
    advance: ms => { time += ms; }, setPermissions: bits => { permissions = new PermissionsBitField(bits); } };
}

test('AI, envio e todas as operações de anúncios anônimas retornam 401 antes de efeitos', async t => {
  const f = setup(t);
  for (const path of ['/api/ai/generate', '/api/discord/send', ...['categories','save','generate','send'].map(action => `/api/announcements/${action}`)]) {
    const res = await f.request(path, { authenticated: false, body: { ...sendInput, guildId, trustedLocal: true, owner: 'local-web' } });
    assert.equal(res.status, 401, path);
    assert.deepEqual(res.body, { error: 'AUTH_REQUIRED' });
  }
  assert.deepEqual(f.counts, { ai: 0, fetch: 0, guilds: 0, saved: 0 });
});

test('sessão expirada não chega à IA', async t => {
  const f = setup(t); f.advance(28800 * 1000);
  assert.equal((await f.request('/api/ai/generate')).status, 401);
  assert.equal(f.counts.ai, 0);
});

test('membro comum, não membro e guild sem bot são proibidos mesmo com sessão e IDs válidos', async t => {
  const f = setup(t);
  f.memberships[0].permissions = '0';
  for (const action of ['categories','save','generate','send']) assert.equal((await f.request(`/api/announcements/${action}`, { body: { guildId, channelId, trustedLocal: true, canManage: true } })).status, 403);
  assert.equal((await f.request('/api/discord/send', { body: sendInput })).status, 403);
  f.memberships.length = 0;
  assert.equal((await f.request('/api/discord/send', { body: sendInput })).status, 403);
  f.memberships.push({ id: guildId, owner: true });
  f.client.guilds.cache.clear();
  assert.equal((await f.request('/api/discord/send', { body: sendInput })).status, 403);
  assert.equal(f.sent.length, 0); assert.equal(f.counts.ai, 0); assert.equal(f.counts.saved, 0);
});

test('owner, Administrator e ManageGuild autorizam save e publicação com menções desabilitadas', async t => {
  const f = setup(t);
  for (const access of [{ owner: true, permissions: '0' }, { owner: false, permissions: '8' }, { owner: false, permissions: '32' }]) {
    Object.assign(f.memberships[0], access);
    const res = await f.request('/api/announcements/save', { body: { guildId, category: { name: `Categoria ${f.counts.saved}`, title: 'Título' } } });
    assert.equal(res.status, 200);
    assert.equal((await f.request('/api/discord/send', { body: sendInput })).status, 200);
    assert.deepEqual(f.sent.at(-1).allowedMentions, { parse: [] });
  }
  assert.equal(f.counts.saved, 3);
});

test('canal de outra guild não pode ser vinculado pelo body e DM é proibida', async t => {
  const f = setup(t);
  f.channel.guildId = otherGuildId;
  assert.equal((await f.request('/api/discord/send', { body: { ...sendInput, guildId } })).status, 403);
  assert.equal((await f.request('/api/announcements/send', { body: { guildId, channelId, draftId: 'anything' } })).status, 403);
  f.channel.guildId = undefined;
  assert.equal((await f.request('/api/discord/send', { body: sendInput })).status, 403);
  assert.equal(f.sent.length, 0);
});

test('permissões do bot são obrigatórias e threads usam SendMessagesInThreads', async t => {
  const f = setup(t);
  for (const bits of [0n, P.ViewChannel, P.SendMessages]) {
    f.setPermissions(bits);
    assert.equal((await f.request('/api/discord/send', { body: sendInput })).status, 403);
  }
  f.channel.isThread = () => true;
  f.setPermissions([P.ViewChannel, P.SendMessages]);
  assert.equal((await f.request('/api/discord/send', { body: sendInput })).status, 403);
  f.setPermissions([P.ViewChannel, P.SendMessagesInThreads]);
  assert.equal((await f.request('/api/discord/send', { body: sendInput })).status, 200);
  assert.equal(f.sent.length, 1);
});

test('drafts Web são isolados por usuário e ignoram owner/contexto de autorização do body', async t => {
  const f = setup(t);
  const generated = await f.request('/api/announcements/generate', { body: { guildId, categoryId: 'default-0', description: 'Ideia', owner: 'local-web' } });
  assert.equal(generated.status, 200);
  const draftId = generated.body.draftId;
  assert.equal(f.services.announcements.get(draftId, 'web:user', guildId).owner, 'web:user');
  const other = f.makeSession('other');
  for (const action of ['generate','send']) assert.equal((await f.request(`/api/announcements/${action}`, { as: other, body: { guildId, channelId, draftId, owner: 'web:user', context: 'Mudança' } })).status, 400);
  assert.equal((await f.request('/api/announcements/send', { body: { guildId, channelId, draftId } })).status, 200);
  assert.deepEqual(f.sent[0].allowedMentions, { parse: [] });
});

test('origin ausente/null/diferente proíbe operações mutáveis antes de efeitos', async t => {
  const f = setup(t);
  for (const origin of [null, 'null', 'https://attacker.example']) {
    for (const path of ['/api/ai/generate','/api/discord/send','/api/announcements/save']) {
      assert.equal((await f.request(path, { origin, body: { ...sendInput, guildId } })).status, 403);
    }
  }
  assert.equal(f.counts.ai, 0); assert.equal(f.counts.fetch, 0); assert.equal(f.counts.guilds, 0);
  assert.equal((await f.request('/api/ai/generate')).status, 200);
});

test('rate limit IA usa userId, bloqueia na 11ª chamada e libera após janela', async t => {
  const f = setup(t);
  for (let i=0; i<10; i++) assert.equal((await f.request('/api/ai/generate')).status, 200);
  const renewed = f.makeSession('user');
  const limited = await f.request('/api/ai/generate', { as: renewed });
  assert.equal(limited.status, 429); assert.equal(limited.headers['Retry-After'], '60');
  assert.equal(f.counts.ai, 10);
  assert.equal((await f.request('/api/ai/generate', { as: f.makeSession('other') })).status, 200);
  f.advance(60000);
  assert.equal((await f.request('/api/ai/generate')).status, 200);
});

test('anúncios IA e envio possuem limites de dez por minuto', async t => {
  const f = setup(t);
  for (let i=0; i<10; i++) assert.equal((await f.request('/api/announcements/generate', { body: { guildId, description: 'Ideia', categoryId: 'default-0' } })).status, 200);
  assert.equal((await f.request('/api/announcements/generate', { body: { guildId } })).status, 429);
  for (let i=0; i<10; i++) assert.equal((await f.request('/api/discord/send', { body: sendInput })).status, 200);
  assert.equal((await f.request('/api/discord/send', { body: sendInput })).status, 429);
  assert.equal((await f.request('/api/announcements/send', { body: { guildId } })).status, 429);
  assert.equal(f.sent.length, 10);
});

test('demais POST autenticados limitam trinta por minuto', async t => {
  const f = setup(t);
  for (let i=0; i<30; i++) assert.equal((await f.request('/api/announcements/categories', { body: { guildId } })).status, 200);
  assert.equal((await f.request('/api/announcements/categories', { body: { guildId } })).status, 429);
});

test('OAuth start usa IP do socket, ignora X-Forwarded-For e limita antes de criar state', async t => {
  const f = setup(t);
  for (let i=0; i<10; i++) assert.equal((await f.request('/api/auth/discord', { method: 'GET', authenticated: false, headers: { 'x-forwarded-for': `10.0.0.${i}` } })).status, 302);
  const res = await f.request('/api/auth/discord', { method: 'GET', authenticated: false, headers: { 'x-forwarded-for': '8.8.8.8' } });
  assert.equal(res.status, 429); assert.equal(f.services.auth.states.size, 10);
});

test('rate limiter limita Map e limpa entradas expiradas sem expulsar limite ativo', () => {
  let now = 0;
  const limiter = new RateLimiter({ maxEntries: 2, now: () => now });
  limiter.consume('a', 1); limiter.consume('b', 1);
  for (let i=0; i<50; i++) assert.throws(() => limiter.consume(`attacker-${i}`, 1), error => error.statusCode === 429 && error.retryAfter > 0);
  assert.equal(limiter.entries.size, 2);
  assert.throws(() => limiter.consume('a', 1), error => error.statusCode === 429);
  now = 60000; limiter.consume('c', 1);
  assert.deepEqual([...limiter.entries.keys()], ['c']);
});

test('health e OPTIONS públicos, CORS explícito e headers básicos em sucesso/erro', async t => {
  const f = setup(t);
  const health = await f.request('/api/health', { method: 'GET', authenticated: false });
  assert.deepEqual(health.body, { ok: true });
  const allowed = await f.request('/api/ai/generate', { method: 'OPTIONS', authenticated: false });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers['Access-Control-Allow-Origin'], 'http://localhost:5173');
  assert.equal(allowed.headers['Access-Control-Allow-Credentials'], 'true');
  const denied = await f.request('/api/ai/generate', { method: 'OPTIONS', authenticated: false, origin: 'https://attacker.example' });
  assert.equal(denied.status, 204);
  assert.equal(denied.headers['Access-Control-Allow-Origin'], undefined);
  const error = await f.request('/api/ai/generate', { authenticated: false });
  for (const response of [health, allowed, denied, error]) {
    assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(response.headers['X-Frame-Options'], 'DENY');
    assert.equal(response.headers['Referrer-Policy'], 'no-referrer');
    assert.equal(response.headers['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
    assert.notEqual(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Strict-Transport-Security'], undefined);
  }
});

test('erro SDK com statusCode não expõe mensagem, tokens, body ou stack em resposta/log', async t => {
  const f = setup(t);
  f.services.textaAI.generate = async () => { throw Object.assign(new Error(`${secret} refresh-private Authorization: private`), { statusCode: 400, body: 'raw SDK' }); };
  const response = await f.request('/api/ai/generate');
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: 'Não foi possível concluir a operação.' });
  const serialized = JSON.stringify({ response, logs: f.logs });
  for (const value of [secret,'refresh-private','raw SDK','Authorization: private']) assert(!serialized.includes(value));
});

test('body limitado por bytes aceita UTF8 fracionado e descarta excesso/objetos inválidos', async () => {
  const bytes = Buffer.from('{"idea":"Olá"}');
  assert.deepEqual(await readJson(Readable.from([bytes.subarray(0,12),bytes.subarray(12)])), { idea: 'Olá' });
  await assert.rejects(readJson(Readable.from([JSON.stringify({ idea: 'é'.repeat(11000) }), 'x'.repeat(20000)])), error => error.statusCode === 413);
  for (const body of ['null','[]','"text"','{']) await assert.rejects(readJson(Readable.from([body])), error => error.statusCode === 400);
});
