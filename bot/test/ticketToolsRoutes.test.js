require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { ticketFixture, ids } = require('./helpers/ticketFixture');
const { loadEnv } = require('../src/config/env');
const { AuthService } = require('../src/services/authService');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { createRequestHandler } = require('../src/api/server');
const { clientError } = require('../src/api/http/errors');

test('HTTP ferramentas: sessão, origem, membership, corpo contextualizado, rate limit e ausência de userId do browser', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  const config = loadEnv({}, { requireDiscord: false }).auth;
  const sessions = new AuthSessionManager(); const session = sessions.create({ id: ids.staff }, { access_token: 'synthetic', expires_in: 3600 });
  const calls = [];
  const services = { auth: new AuthService({ config, sessions, provider: {} }),
    dashboard: { async requireGuildMembership(_session, guildId) { if (guildId !== ids.guild) throw clientError(403, 'Membership denied'); } },
    ticketTools: { async read(input) { calls.push(input); return { canTimeout: true }; }, async execute(input) { calls.push(input); return { result: 'success' }; } },
    tickets: f.service,
  };
  const handler = createRequestHandler({ services });
  async function request(path, { method = 'GET', body, origin = config.webOrigin, authenticated = true } = {}) {
    const req = Object.assign(Readable.from(body ? [JSON.stringify(body)] : []), { method, url: path, headers: { ...(authenticated ? { cookie: `cylbot_session=${session.id}` } : {}), origin, 'content-type': 'application/json' }, socket: {} });
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); return this; }, end(value) { this.body = value ? JSON.parse(value) : null; } };
    await handler(req, res); return res;
  }
  const tools = `/api/tickets/${ticket.id}/tools`;
  assert.equal((await request(`${tools}?guildId=${ids.guild}`, { authenticated: false })).status, 401);
  assert.equal((await request(`${tools}?guildId=${ids.guild}`)).status, 200);
  assert.equal(calls.at(-1).userId, ids.staff);
  assert.equal((await request(`${tools}?guildId=${ids.otherGuild}`)).status, 403);
  const body = { guildId: ids.guild, reason: 'Teste', confirm: true, durationMs: 300000 };
  assert.equal((await request(`${tools}/timeout`, { method: 'POST', body, origin: 'https://evil.test' })).status, 403);
  assert.equal((await request(`${tools}/timeout`, { method: 'POST', body: { ...body, targetUserId: ids.admin } })).status, 400);
  assert.equal((await request(`${tools}/timeout`, { method: 'POST', body })).status, 200);
  assert.equal(calls.at(-1).ticketId, ticket.id); assert.equal(calls.at(-1).userId, ids.staff); assert.equal(calls.at(-1).targetUserId, undefined);
  let limited;
  for (let index = 0; index < 5; index++) limited = await request(`${tools}/timeout`, { method: 'POST', body });
  assert.equal(limited.status, 429); assert(limited.headers['Retry-After']);
});
test('HTTP concluir: capability staff obrigatória, CLOSED preservado e solução persistente', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  const config = loadEnv({}, { requireDiscord: false }).auth; const sessions = new AuthSessionManager();
  const service = { auth: new AuthService({ config, sessions, provider: {} }), dashboard: { async requireGuildMembership() {} }, tickets: f.service };
  const handler = createRequestHandler({ services: service });
  async function conclude(userId, body) {
    const session = sessions.create({ id: userId }, { access_token: 'synthetic', expires_in: 3600 });
    const req = Object.assign(Readable.from([JSON.stringify(body)]), { method: 'POST', url: `/api/tickets/${ticket.id}/actions/conclude`, headers: { cookie: `cylbot_session=${session.id}`, origin: config.webOrigin, 'content-type': 'application/json' }, socket: {} });
    const res = { setHeader() {}, writeHead(status) { this.status = status; return this; }, end(value) { this.body = JSON.parse(value); } };
    await handler(req, res); return res;
  }
  assert.equal((await conclude(ids.user, { guildId: ids.guild, summary: 'Solução' })).status, 403);
  assert.equal((await conclude(ids.staff, { guildId: ids.guild, summary: '' })).status, 400);
  const response = await conclude(ids.staff, { guildId: ids.guild, summary: 'Resolvido com orientação' });
  assert.equal(response.status, 200); assert.equal(response.body.ticket.status, 'CONCLUDED');
  assert.equal(response.body.ticket.actions.canReopen, true);
  assert.equal(f.repository.get(ids.guild, ticket.id).closing.summary, 'Resolvido com orientação');
});
