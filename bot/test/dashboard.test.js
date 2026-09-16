require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { loadEnv } = require('../src/config/env');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { DashboardService, canManageGuild } = require('../src/services/dashboardService');
const { DiscordOAuthProvider } = require('../src/providers/discordOAuthProvider');
const { createRequestHandler } = require('../src/api/server');
const { logger } = require('../src/lib/logger');

const user = { id: '123456789012345678', username: 'tester', displayName: 'Tester', avatarUrl: null };
const token = { access_token: 'private-dashboard-access', refresh_token: 'private-dashboard-refresh', expires_in: 3600, scope: 'identify guilds' };
const id = n => String(100000000000000000n + BigInt(n));
const guild = (n, fields = {}) => ({ id: id(n), name: `Servidor ${n}`, icon: null, owner: false, permissions: '0', ...fields });

function fixture(t, guilds = []) {
  let time = 1000;
  let ready = true;
  const now = () => time;
  const config = loadEnv({}, { requireDiscord: false }).auth;
  const sessions = new AuthSessionManager({ now });
  const session = sessions.create(user, token);
  const calls = [];
  const provider = { getCurrentUserGuilds: async access => { calls.push(access); return guilds; } };
  const client = { isReady: () => ready, guilds: { cache: new Map([[id(1), {}], [id(2), {}], [id(3), {}]]) } };
  const dashboard = new DashboardService({ provider, client, now });
  const logs = [];
  for (const level of ['info', 'warn', 'error']) t.mock.method(logger, level, (event, context) => logs.push({ event, ...context }));
  return { context: { services: { auth: { sessions, config }, dashboard } }, dashboard, provider, session, sessions, calls, logs,
    setReady: value => { ready = value; }, advance: ms => { time += ms; } };
}

async function request(context, sessionId, query = '', method = 'GET') {
  const incoming = Object.assign(Readable.from(['{"userId":"attacker","permissions":"8"}']), {
    method, url: `/api/dashboard/guilds${query}`, headers: sessionId ? { cookie: `cylbot_session=${sessionId}` } : {},
  });
  const response = {
    headers: {}, ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); return this; },
    end(body) { assert.equal(this.ended, false); this.ended = true; this.body = body ? JSON.parse(body) : undefined; },
  };
  await createRequestHandler(context)(incoming, response);
  assert(response.ended);
  return response;
}

test('canManageGuild aceita somente owner booleano, Administrator ou ManageGuild usando BigInt', () => {
  assert.equal(canManageGuild({ owner: true, permissions: '0' }), true);
  assert.equal(canManageGuild({ owner: true, permissions: null }), true);
  for (const permissions of ['8', '32', '40', ((1n << 60n) | 32n).toString()]) assert.equal(canManageGuild({ permissions }), true);
  for (const permissions of ['0', '16', '1024', (1n << 60n).toString(), '', 'abc', '-1', '8.0', '0x8', ' 8 ', '8e0', '9'.repeat(41), 8, 32n, null, undefined, {}, true]) {
    assert.equal(canManageGuild({ owner: 'true', permissions }), false, String(permissions));
  }
});

test('rota sem sessão, com sessão inventada ou expirada retorna 401 sem chamar Discord', async t => {
  const f = fixture(t);
  for (const sessionId of [undefined, 'x'.repeat(43)]) {
    const response = await request(f.context, sessionId);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { error: 'AUTH_RELOGIN_REQUIRED' });
  }
  f.advance(28800 * 1000);
  assert.equal((await request(f.context, f.session.id)).status, 401);
  assert.equal(f.calls.length, 0);
});

test('guilds cruza cache, calcula acesso e retorna DTO sem tokens, permissions ou objetos internos', async t => {
  const f = fixture(t, [guild(4), guild(3, { permissions: '0' }), guild(2, { permissions: '32' }), guild(1, { owner: true })]);
  const response = await request(f.context, f.session.id);
  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(response.body.guilds.map(g => [g.id, g.botInstalled, g.canManage]), [
    [id(1), true, true], [id(2), true, true], [id(3), true, false], [id(4), false, false],
  ]);
  for (const item of response.body.guilds) assert.deepEqual(Object.keys(item).sort(), ['botInstalled', 'canManage', 'iconUrl', 'id', 'name', 'owner']);
  for (const secret of [token.access_token, token.refresh_token, f.session.id, 'permissions']) assert.equal(JSON.stringify(response.body).includes(secret), false);
  assert.deepEqual(f.calls, [token.access_token]);
  const log = f.logs.find(item => item.event === 'dashboard.guilds_loaded');
  assert.equal(log.guildCount, 4);
  assert.equal(log.installedCount, 3);
  assert.equal(log.manageableCount, 2);
  assert.equal(log.userId, user.id);
  assert(log.requestId);
  assert.equal(JSON.stringify(f.logs).includes('Servidor'), false);
});

test('query e body não podem substituir usuário, token ou permissões da sessão', async t => {
  const f = fixture(t, [guild(1)]);
  const response = await request(f.context, f.session.id, '?userId=attacker&accessToken=other&permissions=8');
  assert.equal(response.status, 200);
  assert.equal(response.body.guilds[0].canManage, false);
  assert.deepEqual(f.calls, [token.access_token]);
  assert.equal((await request(f.context, undefined, '?userId=attacker')).status, 401);
  assert.equal((await request(f.context, f.session.id, '', 'POST')).status, 404);
});

test('sessão antiga sem guilds ou token vencido exige relogin, remove sessão e cookie', async t => {
  const f = fixture(t);
  const variants = [undefined, [], ['identify'], 'identify guilds', ['not-guilds']];
  for (const scopes of variants) {
    const session = f.sessions.create(user, token);
    session.discordScopes = scopes;
    const response = await request(f.context, session.id);
    assert.equal(response.status, 401);
    assert.equal(f.sessions.get(session.id), undefined);
    assert.match(response.headers['Set-Cookie'], /Max-Age=0/);
  }
  f.advance(token.expires_in * 1000);
  assert.equal((await request(f.context, f.session.id)).status, 401);
  assert.equal(f.sessions.get(f.session.id), undefined);
  assert.equal(f.calls.length, 0);
});

test('token rejeitado ou escopo insuficiente no Discord invalida sessão sem expor erro externo', async t => {
  const f = fixture(t);
  f.provider.getCurrentUserGuilds = async () => { throw Object.assign(new Error(token.access_token), { statusCode: 401 }); };
  const response = await request(f.context, f.session.id);
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'AUTH_RELOGIN_REQUIRED' });
  assert.equal(f.sessions.get(f.session.id), undefined);
  assert.equal(JSON.stringify({ response, logs: f.logs }).includes(token.access_token), false);
});

test('falha transitória gera erro controlado, preserva sessão e permite nova tentativa', async t => {
  const f = fixture(t);
  f.provider.getCurrentUserGuilds = async () => { throw new Error(`Discord raw ${token.access_token} ${token.refresh_token}`); };
  const response = await request(f.context, f.session.id);
  assert.equal(response.status, 502);
  assert.deepEqual(response.body, { error: 'Não foi possível carregar seus servidores. Tente novamente.' });
  assert(f.sessions.get(f.session.id));
  assert.equal(JSON.stringify({ response, logs: f.logs }).includes('private-dashboard'), false);
  f.provider.getCurrentUserGuilds = async () => [];
  assert.deepEqual((await request(f.context, f.session.id)).body, { guilds: [] });
});

test('cache do bot só é usado com cliente pronto; desconexão não marca guilds como ausentes', async t => {
  const f = fixture(t, [guild(1)]);
  f.setReady(false);
  assert.equal((await request(f.context, f.session.id)).status, 503);
  assert.equal(f.calls.length, 0);
  f.setReady(true);
  f.provider.getCurrentUserGuilds = async () => { f.setReady(false); return [guild(1)]; };
  assert.equal((await request(f.context, f.session.id)).status, 503);
  assert(f.sessions.get(f.session.id));
});

test('logout ou expiração durante consulta não permite devolver guilds', async t => {
  const f = fixture(t);
  f.provider.getCurrentUserGuilds = async () => { f.sessions.remove(f.session.id); return [guild(1)]; };
  assert.equal((await request(f.context, f.session.id)).status, 401);
  const other = f.sessions.create(user, token);
  f.provider.getCurrentUserGuilds = async () => { f.advance(3600 * 1000); return [guild(1)]; };
  assert.equal((await request(f.context, other.id)).status, 401);
});

test('ordenação por grupo, nome e desempate ID independe da ordem do Discord', async t => {
  const input = [guild(5, { name: 'Alfa', permissions: '32' }), guild(3, { name: 'A' }),
    guild(2, { name: 'Z', permissions: '8' }), guild(1, { name: 'B', permissions: '32' }), guild(4, { name: 'Alfa' })];
  const f = fixture(t, input);
  const expected = [id(1), id(2), id(3), id(4), id(5)];
  assert.deepEqual((await f.dashboard.guilds(f.session)).map(g => g.id), expected);
  input.reverse();
  assert.deepEqual((await f.dashboard.guilds(f.session)).map(g => g.id), expected);
});

test('iconUrl é montada no backend para PNG/GIF e null quando não há ícone', async t => {
  const icon = 'a'.repeat(32);
  const f = fixture(t, [guild(1, { icon }), guild(2, { icon: `a_${icon}` }), guild(3)]);
  const result = await f.dashboard.guilds(f.session);
  assert.equal(result[0].iconUrl, `https://cdn.discordapp.com/icons/${id(1)}/${icon}.png`);
  assert.equal(result[1].iconUrl, `https://cdn.discordapp.com/icons/${id(2)}/a_${icon}.gif`);
  assert.equal(result[2].iconUrl, null);
});

test('provider usa token backend, normaliza somente campos necessários e não calcula acesso', async () => {
  const calls = [];
  const provider = new DiscordOAuthProvider({}, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => [guild(1, { icon: '../invalid', owner: 'true', permissions: 8, secretExtra: 'private', features: ['COMMUNITY'] }), guild(2, { permissions: '32', icon: 'a'.repeat(32) })] };
  });
  const result = await provider.getCurrentUserGuilds(token.access_token);
  assert.equal(calls[0].url, 'https://discord.com/api/v10/users/@me/guilds?limit=200');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${token.access_token}`);
  assert.equal(calls[0].options.redirect, 'error');
  assert(calls[0].options.signal instanceof AbortSignal);
  assert.deepEqual(result[0], { id: id(1), name: 'Servidor 1', icon: null, owner: false, permissions: null });
  assert.equal(result[1].permissions, '32');
  assert.equal(result[1].canManage, undefined);
});

test('provider trata 401/403 como relogin, mas 429/500/rede/JSON como falha temporária sem body bruto', async () => {
  for (const status of [401, 403, 429, 500]) {
    const provider = new DiscordOAuthProvider({}, async () => ({ ok: false, status, json: () => assert.fail('Não ler resposta bruta de erro') }));
    await assert.rejects(provider.getCurrentUserGuilds('fake'), error => error.statusCode === ([401, 403].includes(status) ? 401 : 502));
  }
  for (const fetchImpl of [
    async () => { throw new Error(token.access_token); },
    async () => ({ ok: true, json: async () => { throw new Error(token.refresh_token); } }),
  ]) {
    const provider = new DiscordOAuthProvider({}, fetchImpl);
    await assert.rejects(provider.getCurrentUserGuilds('fake'), error => error.statusCode === 502 && !error.message.includes('private-dashboard'));
  }
});

test('provider rejeita payload inválido em vez de exibir lista vazia enganosa', async () => {
  for (const data of [null, {}, [null], [{ id: 'not-snowflake', name: 'Name' }], [guild(1, { name: null })], Array(201).fill(guild(1))]) {
    const provider = new DiscordOAuthProvider({}, async () => ({ ok: true, json: async () => data }));
    await assert.rejects(provider.getCurrentUserGuilds('fake'), error => error.statusCode === 502);
  }
});
