require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadEnv } = require('../src/config/env');
const { AuthService } = require('../src/services/authService');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { TICKET_STATUS: S } = require('../src/Ticket/services/ticketConstants');
const { TicketInvalidStateError, transition } = require('../src/Ticket/services/ticketDomain');
const healthRoute = require('../src/api/routes/healthRoutes');

test('produção sem DATABASE_URL falha antes de criar configuração executável', () => {
  assert.throws(() => loadEnv({ NODE_ENV: 'production' }, { requireDiscord: false }), /DATABASE_URL is required in production/);
});

test('state machine aceita apenas as transições de negócio', () => {
  for (const [from, to] of [[S.OPEN, S.CLAIMED], [S.OPEN, S.CLOSED], [S.CLAIMED, S.CLOSED], [S.CLOSED, S.REOPENED], [S.REOPENED, S.CLAIMED], [S.REOPENED, S.CLOSED]]) {
    const ticket = { status: from };
    transition(ticket, to);
    assert.equal(ticket.status, to);
  }
  for (const [from, to] of [[S.CLOSED, S.CLAIMED], [S.OPEN, S.REOPENED], [S.CLAIMED, S.REOPENED]]) {
    assert.throws(() => transition({ status: from }, to), TicketInvalidStateError);
  }
});

test('health diferencia banco indisponível sem expor detalhes de conexão', async () => {
  const response = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = JSON.parse(body); } };
  await healthRoute.handle({ method: 'GET', url: '/api/health' }, response, { services: { database: { ping: async () => { throw new Error('postgres://secret'); } } } });
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { ok: false, database: 'unavailable' });
  assert.equal(JSON.stringify(response.body).includes('secret'), false);
});

test('DATABASE_URL fica centralizada na configuração e não é retornada por health/config pública', () => {
  const config = loadEnv({ DATABASE_URL: 'postgresql://cylbot:cylbot_dev@localhost:5432/cylbot' }, { requireDiscord: false });
  assert.equal(config.database.url, 'postgresql://cylbot:cylbot_dev@localhost:5432/cylbot');
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'password'), false);
});

test('OAuth faz upsert do perfil Discord antes de criar a sessão', async () => {
  const profile = { id: '123456789012345678', username: 'user', displayName: 'User', avatarUrl: 'https://cdn.example/avatar.png' };
  const calls = [];
  const auth = new AuthService({
    config: loadEnv({ DISCORD_CLIENT_ID: profile.id, DISCORD_OAUTH_CLIENT_SECRET: 'secret' }, { requireDiscord: false }).auth,
    provider: {
      authorizationUrl: state => `https://discord.test/${state}`,
      exchangeCode: async () => ({ access_token: 'token', expires_in: 3600, token_type: 'Bearer' }),
      getUser: async () => profile,
    },
    users: { upsertDiscordUser: async user => calls.push(user) },
    sessions: new AuthSessionManager(),
  });
  const started = auth.begin();
  const session = await auth.complete({ ...started, code: 'code' });
  assert.equal(session.user.id, profile.id);
  assert.deepEqual(calls, [profile]);
});
