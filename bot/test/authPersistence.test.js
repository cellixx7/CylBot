require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { PostgresAuthSessionRepository } = require('../src/repositories/postgresAuthSessionRepository');
const { DiscordOAuthProvider } = require('../src/providers/discordOAuthProvider');
const { clientError } = require('../src/api/http/errors');
const { AuthService } = require('../src/services/authService');
const { createRequestHandler } = require('../src/api/server');
const { loadEnv } = require('../src/config/env');
const { Readable } = require('node:stream');
const user = { id: '1548161474227077212', username: 'Tester' };
const token = { access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 600, scope: 'identify guilds' };
function fixture() {
  const rows = new Map(); let time = 1000; let refreshes = 0;
  const repository = { create: async s => rows.set(s.id, structuredClone(s)), get: async id => structuredClone(rows.get(id)),
    save: async s => { if (!rows.has(s.id)) return false; rows.set(s.id, structuredClone(s)); return true; }, remove: async id => rows.delete(id), cleanup: async () => {} };
  const provider = { refreshToken: async () => { refreshes++; await new Promise(r => setImmediate(r)); return { ...token, access_token: 'renewed-access' }; } };
  const manager = () => new AuthSessionManager({ repository, provider, ttlSeconds: 10000, now: () => time });
  return { repository, provider, manager, advance: ms => { time += ms; }, count: () => refreshes };
}
test('store persistente recupera sessão após restart e logout remove em outra instância', async () => {
  const f = fixture(); const first = f.manager(); const session = await first.create(user, token);
  const restarted = f.manager(); assert.equal((await restarted.authenticate(session.id)).user.id, user.id);
  await restarted.remove(session.id); assert.equal(await first.authenticate(session.id), null);
});
test('TTL fixo não grava nem estende a sessão em cada request; vencimento exige login', async () => {
  const f = fixture(); const manager = f.manager(); const s = await manager.create(user, token);
  f.advance(10000); const loaded = await manager.authenticate(s.id); assert.equal(loaded.expiresAt, s.expiresAt);
  f.advance(10000000); await assert.rejects(manager.authenticate(s.id), e => e.statusCode === 401 && e.message === 'SESSION_EXPIRED');
});
test('cinco requests renovam OAuth uma vez; falha transitória preserva e invalid_grant remove', async () => {
  const f = fixture(); const manager = f.manager(); const s = await manager.create(user, token); f.advance(500000);
  const values = await Promise.all(Array.from({ length: 5 }, () => manager.authenticate(s.id)));
  assert.equal(f.count(), 1); assert(values.every(v => v.discordAccessToken === 'renewed-access'));
  f.advance(500000); f.provider.refreshToken = async () => { throw clientError(503, 'temporário'); };
  await assert.rejects(manager.authenticate(s.id), { statusCode: 503 }); assert(await f.repository.get(s.id));
  f.provider.refreshToken = async () => { throw clientError(401, 'AUTH_RELOGIN_REQUIRED'); };
  await assert.rejects(manager.authenticate(s.id), { statusCode: 401 }); assert.equal(await f.repository.get(s.id), undefined);
});
test('credenciais AES-GCM e hash não incluem tokens nem ID cru; adulteração é rejeitada', () => {
  const repo = new PostgresAuthSessionRepository({ pool: {} }, randomBytes(32).toString('hex'));
  const session = { id: 'opaque-cookie', user, discordAccessToken: token.access_token, discordRefreshToken: token.refresh_token };
  const value = repo.encrypt(session); assert(!value.includes(token.access_token)); assert.notEqual(repo.hash(session.id), session.id);
  assert.deepEqual(repo.decrypt(session.id, value), session);
  assert.throws(() => repo.decrypt('different-cookie', value));
});
test('refresh Discord distingue invalid_grant de timeout, 429 e 5xx', async () => {
  for (const status of [400, 429, 500]) {
    const provider = new DiscordOAuthProvider({}, async () => ({ ok: false, status, json: async () => ({ error: status === 400 ? 'invalid_grant' : 'temporary' }) }));
    await assert.rejects(provider.refreshToken('fake'), { statusCode: status === 400 ? 401 : 503 });
  }
});

test('me recupera sessão do store após nova instância, não expõe tokens e 503 não limpa cookie', async () => {
  const f = fixture(); const session = await f.manager().create(user, token);
  const config = loadEnv({}, { requireDiscord: false }).auth;
  const auth = new AuthService({ config, sessions: f.manager(), provider: f.provider });
  const handler = createRequestHandler({ services: { auth } });
  const request = async () => {
    const req = Object.assign(Readable.from([]), { method: 'GET', url: '/api/auth/me', headers: { cookie: `cylbot_session=${session.id}` } });
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, writeHead(status) { this.status = status; return this; }, end(body) { this.body = body ? JSON.parse(body) : null; } };
    await handler(req, res); return res;
  };
  const me = await request(); assert.equal(me.status, 200); assert.equal(me.body.user.id, user.id);
  assert(!JSON.stringify(me.body).includes(token.access_token)); assert(!JSON.stringify(me.body).includes(token.refresh_token));
  f.advance(500000); f.provider.refreshToken = async () => { throw clientError(503, 'temporário'); };
  const unavailable = await request(); assert.equal(unavailable.status, 503); assert.equal(unavailable.headers['Set-Cookie'], undefined);
  assert(await f.repository.get(session.id));
});
