require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { ticketAIFixture, ids } = require('./helpers/ticketAIFixture');
const { loadEnv } = require('../src/config/env');
const { AuthService } = require('../src/services/authService');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { DashboardService } = require('../src/services/dashboardService');
const { createRequestHandler } = require('../src/api/server');

async function setup(t) {
  const f = await ticketAIFixture(t);
  const config = loadEnv({}, { requireDiscord: false }).auth;
  const sessions = new AuthSessionManager();
  const session = sessions.create({ id: ids.admin }, { access_token: 'synthetic', expires_in: 3600, scope: 'identify guilds' });
  const memberships = [{ id: ids.guild, name: 'Guild', permissions: '32', owner: false }];
  const provider = { getCurrentUserGuilds: async () => memberships };
  const client = { isReady: () => true, guilds: { cache: new Map([[ids.guild, {}], [ids.otherGuild, {}]]) } };
  const auth = new AuthService({ config, sessions, provider });
  const services = { auth, dashboard: new DashboardService({ provider, client }), ticketAI: f.ai };
  const handler = createRequestHandler({ services, client });
  const request = async (url, { method = 'POST', body = { guildId: ids.guild }, authenticated = true, origin = config.webOrigin } = {}) => {
    const req = Object.assign(Readable.from([JSON.stringify(body)]), { method, url, headers: {
      ...(authenticated ? { cookie: `cylbot_session=${session.id}` } : {}), ...(origin ? { origin } : {}),
    }, socket: { remoteAddress: 'local' } });
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, writeHead(status, h) { this.status = status; Object.assign(this.headers, h); return this; },
      end(value) { this.body = value ? JSON.parse(value) : null; } };
    await handler(req, res); return res;
  };
  return { ...f, request, memberships, provider, sessions, session, path: `/api/tickets/${f.ticket.id}/ai/analyze`, configPath: `/api/tickets/ai/config/${ids.guild}` };
}

test('rotas IA exigem sessão, Origin confiável e OAuth ManageGuild', async t => {
  const f = await setup(t);
  assert.equal((await f.request(f.path, { authenticated: false })).status, 401);
  assert.equal((await f.request(f.configPath, { method: 'GET', authenticated: false })).status, 401);
  assert.equal((await f.request(f.path, { origin: null })).status, 403);
  assert.equal((await f.request(f.path, { origin: 'https://attacker.invalid' })).status, 403);
  f.memberships[0].permissions = '0';
  assert.equal((await f.request(f.path)).status, 403);
  f.memberships.length = 0;
  assert.equal((await f.request(f.path)).status, 403);
  assert.equal(f.requests.length, 0);
});

test('admin autorizado configura e analisa via services compartilhados sem executar resposta', async t => {
  const f = await setup(t);
  const get = await f.request(f.configPath, { method: 'GET' });
  assert.equal(get.status, 200); assert.equal(get.headers['Cache-Control'], 'no-store');
  assert.match(get.headers['Access-Control-Allow-Methods'], /PUT/);
  assert.equal((await f.request(f.configPath, { method: 'PUT', body: { ...get.body.config, tone: 'objetivo' } })).status, 200);
  const result = await f.request(f.path);
  assert.equal(result.status, 200); assert.equal(result.body.status, 'suggested');
  assert.equal(f.requests.length, 1); assert.equal(f.sent.length, 0);
  assert.equal(f.requests[0].messages[1].content.includes('objetivo'), true);
});

test('rotas bloqueiam ticket cross-guild, body com ações e revogação de sessão durante OAuth', async t => {
  const f = await setup(t); f.memberships.push({ id: ids.otherGuild, permissions: '32' });
  assert.equal((await f.request(f.path, { body: { guildId: ids.otherGuild } })).status, 404);
  assert.equal((await f.request(f.path, { body: { guildId: ids.guild, action: 'CLOSE', userId: ids.admin } })).status, 400);
  assert.equal((await f.request(f.configPath, { method: 'PUT', body: { enabled: true, apiKey: 'not-allowed' } })).status, 400);
  f.provider.getCurrentUserGuilds = async () => { f.sessions.remove(f.session.id); return f.memberships; };
  assert.equal((await f.request(f.path)).status, 401);
  assert.equal(f.requests.length, 0);
});

test('pause/resume API persiste estado e API não possui execute genérico', async t => {
  const f = await setup(t);
  const path = `/api/tickets/${f.ticket.id}/ai`;
  assert.equal((await f.request(`${path}/pause`)).body.paused, true);
  assert.equal((await f.repository.getState(ids.guild, f.ticket.id)).paused, true);
  assert.equal((await f.request(`${path}/resume`)).body.paused, false);
  assert.equal((await f.request(`${path}/execute`)).status, 404);
  assert.equal((await f.request(f.configPath, { method: 'POST' })).status, 405);
  assert.equal(f.requests.length, 0);
});

test('rotas IA aplicam limite próprio por usuário inclusive em GET config', async t => {
  const f = await setup(t);
  for (let i = 0; i < 30; i++) assert.equal((await f.request(f.configPath, { method: 'GET' })).status, 200);
  const result = await f.request(f.configPath, { method: 'GET' });
  assert.equal(result.status, 429); assert(result.headers['Retry-After']);
});
