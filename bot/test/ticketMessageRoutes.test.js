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

async function setup(t, userId = ids.staff) {
  const f = await ticketAIFixture(t); f.messages.length = 0;
  const config = loadEnv({}, { requireDiscord: false }).auth;
  const sessions = new AuthSessionManager();
  const session = sessions.create({ id: userId }, { access_token: 'synthetic', expires_in: 3600, scope: 'identify guilds' });
  const memberships = [{ id: ids.guild, name: 'Guild', permissions: '0', owner: false }];
  const provider = { getCurrentUserGuilds: async () => memberships };
  const client = { isReady: () => true, guilds: { cache: new Map([[ids.guild, {}]]) } };
  const auth = new AuthService({ config, sessions, provider });
  const services = { auth, dashboard: new DashboardService({ provider, client }), ticketMessages: f.messageService, ticketAI: f.ai };
  const handler = createRequestHandler({ services, client });
  const request = async (url, { method = 'GET', body, authenticated = true, origin = config.webOrigin } = {}) => {
    const req = Object.assign(Readable.from(body ? [JSON.stringify(body)] : []), { method, url, headers: {
      ...(authenticated ? { cookie: `cylbot_session=${session.id}` } : {}), ...(origin ? { origin } : {}),
    }, socket: { remoteAddress: 'local' } });
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, writeHead(status, h) { this.status = status; Object.assign(this.headers, h); return this; },
      end(value) { this.body = value ? JSON.parse(value) : null; } };
    await handler(req, res); return res;
  };
  return { ...f, memberships, request, base: `/api/tickets/${f.ticket.id}/messages`, config };
}

test('support role sem ManageGuild lista e envia; OAuth membership continua obrigatório', async t => {
  const f = await setup(t);
  const post = await f.request(f.base, { method: 'POST', body: { guildId: ids.guild,
    clientMessageId: 'route-message-0001', content: 'Resposta da equipe' } });
  assert.equal(post.status, 200);
  assert.equal(post.body.message.authorType, 'STAFF');
  assert.equal(post.body.message.deliveryStatus, 'SENT');
  const list = await f.request(`${f.base}?guildId=${ids.guild}&limit=20`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.messages.map(message => message.content), ['Resposta da equipe']);
  f.memberships.length = 0;
  assert.equal((await f.request(`${f.base}?guildId=${ids.guild}`)).status, 403);
});

test('routes não aceitam identidade do browser, exigem sessão/Origin e preservam idempotência', async t => {
  const f = await setup(t, ids.user);
  const body = { guildId: ids.guild, clientMessageId: 'route-message-0002', content: 'Mensagem do criador' };
  assert.equal((await f.request(f.base, { method: 'POST', body, authenticated: false })).status, 401);
  assert.equal((await f.request(f.base, { method: 'POST', body, origin: null })).status, 403);
  assert.equal((await f.request(f.base, { method: 'POST', body: { ...body, authorType: 'STAFF' } })).status, 400);
  const first = await f.request(f.base, { method: 'POST', body });
  const retry = await f.request(f.base, { method: 'POST', body });
  assert.equal(first.status, 200); assert.equal(retry.status, 200);
  assert.equal(first.body.message.id, retry.body.message.id);
  assert.equal(first.body.message.authorType, 'USER');
  assert.equal(f.messages.length, 1);
});

test('paginação valida limit/cursor e ticket de outra guild não pode ser consultado', async t => {
  const f = await setup(t);
  assert.equal((await f.request(`${f.base}?guildId=${ids.guild}&limit=101`)).status, 400);
  assert.equal((await f.request(`${f.base}?guildId=${ids.guild}&before=invalid`)).status, 400);
  f.memberships.push({ id: ids.otherGuild, name: 'Outra', permissions: '0', owner: false });
  assert.equal((await f.request(`${f.base}?guildId=${ids.otherGuild}`)).status, 403);
});
