require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { loadEnv } = require('../src/config/env');
const { AuthService, STATE_TTL_SECONDS } = require('../src/services/authService');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { DiscordOAuthProvider } = require('../src/providers/discordOAuthProvider');
const { createRequestHandler } = require('../src/api/server');
const { logger } = require('../src/lib/logger');

const user = { id: '123456789012345678', username: 'cyl_user', displayName: 'Cyl User', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png' };
const token = { access_token: 'fake-private-access', refresh_token: 'fake-private-refresh', expires_in: 3600, token_type: 'Bearer', scope: 'identify guilds' };
function setup(t, https = false) {
  const origin = https ? 'https://cyl.example' : 'http://localhost:5173';
  const config = loadEnv({ DISCORD_CLIENT_ID: user.id, DISCORD_OAUTH_CLIENT_SECRET: 'fake-private-secret', WEB_ORIGIN: origin }, { requireDiscord: false }).auth;
  let time = 1000;
  const now = () => time;
  const calls = [];
  const real = new DiscordOAuthProvider(config);
  const provider = {
    authorizationUrl: state => real.authorizationUrl(state),
    exchangeCode: async code => { calls.push(code); return token; },
    getUser: async access => { assert.equal(access, token.access_token); return user; },
  };
  const sessions = new AuthSessionManager({ ttlSeconds: config.sessionTtlSeconds, now });
  const auth = new AuthService({ config, provider, sessions, now });
  const logs = [];
  for (const level of ['info', 'warn', 'error']) t.mock.method(logger, level, (event, context) => logs.push({ event, ...context }));
  return { auth, config, sessions, provider, calls, logs, advance: ms => { time += ms; } };
}
async function request(auth, method, url, cookie = '', origin) {
  const req = Object.assign(Readable.from([]), { method, url, headers: { cookie, ...(origin ? { origin } : {}) } });
  const res = {
    headers: {}, ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); return this; },
    end(body) { assert.equal(this.ended, false); this.ended = true; this.body = body ? JSON.parse(body) : undefined; },
  };
  await createRequestHandler({ services: { auth } })(req, res);
  assert(res.ended);
  return res;
}
const cookieJar = response => response.headers['Set-Cookie'].map(value => value.split(';')[0]).join('; ');
const sessionCookie = response => response.headers['Set-Cookie'].find(value => value.startsWith('cylbot_session=')).split(';')[0];
async function begin(auth) {
  const response = await request(auth, 'GET', '/api/auth/discord');
  return { response, cookies: cookieJar(response), state: new URL(response.headers.Location).searchParams.get('state') };
}
async function login(auth, previous = '') {
  const start = await begin(auth);
  return request(auth, 'GET', `/api/auth/discord/callback?code=fake-code&state=${start.state}`, `${start.cookies}; ${previous}`);
}

test('início redireciona somente com identify guilds e cria state/cookies temporários seguros', async t => {
  const { auth } = setup(t);
  const { response, state } = await begin(auth);
  const url = new URL(response.headers.Location);
  assert.equal(response.status, 302);
  assert.equal(url.origin, 'https://discord.com');
  assert.equal(url.searchParams.get('scope'), 'identify guilds');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:5173/api/auth/discord/callback');
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  assert(auth.states.has(state));
  for (const cookie of response.headers['Set-Cookie']) assert.match(cookie, /Path=\/; HttpOnly; SameSite=Lax; Max-Age=300/);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('state ausente/incorreto e callback sem cookie do navegador não trocam code', async t => {
  const { auth, calls } = setup(t);
  const start = await begin(auth);
  for (const [query, cookies] of [
    ['code=fake-code', start.cookies],
    ['code=fake-code&state=wrong', start.cookies],
    [`code=fake-code&state=${start.state}`, ''],
    [`code=fake-code&state=${start.state}`, `cylbot_oauth_state=${start.state}; cylbot_oauth_binding=${'x'.repeat(43)}`],
    [`code=fake-code&state=${start.state}&state=other`, start.cookies],
  ]) {
    const response = await request(auth, 'GET', `/api/auth/discord/callback?${query}`, cookies);
    assert.match(response.headers.Location, /authError=login_failed$/);
    assert.equal(auth.sessions.sessions.size, 0);
  }
  assert.deepEqual(calls, []);
});

test('state expira após cinco minutos e não permite autenticar', async t => {
  const { auth, advance, calls } = setup(t);
  const start = await begin(auth);
  advance(STATE_TTL_SECONDS * 1000);
  const res = await request(auth, 'GET', `/api/auth/discord/callback?state=${start.state}&code=code`, start.cookies);
  assert.match(res.headers.Location, /authError=/);
  assert.equal(auth.states.has(start.state), false);
  assert.equal(calls.length, 0);
});

test('callback sem code e autorização negada consomem state e retornam erro genérico', async t => {
  const { auth, calls } = setup(t);
  for (const suffix of ['', '&error=access_denied&error_description=private-detail', '&code=code&error=access_denied']) {
    const start = await begin(auth);
    const res = await request(auth, 'GET', `/api/auth/discord/callback?state=${start.state}${suffix}`, start.cookies);
    assert.match(res.headers.Location, /authError=login_failed$/);
    assert.equal(auth.states.has(start.state), false);
    assert.equal(JSON.stringify(res).includes('private-detail'), false);
  }
  assert.equal(calls.length, 0);
});

test('callback válido cria sessão, cookie opaco e me retorna exclusivamente perfil público', async t => {
  const { auth, config, logs } = setup(t);
  const res = await login(auth);
  assert.equal(res.headers.Location, `${config.webOrigin}/`);
  const cookie = sessionCookie(res);
  const id = cookie.split('=')[1];
  assert.match(id, /^[A-Za-z0-9_-]{43}$/);
  assert.match(res.headers['Set-Cookie'][2], /HttpOnly; SameSite=Lax; Max-Age=28800$/);
  const session = auth.sessions.get(id);
  assert.equal(session.discordAccessToken, token.access_token);
  assert.equal(session.discordRefreshToken, token.refresh_token);
  assert.deepEqual(session.discordScopes, ['identify', 'guilds']);
  const me = await request(auth, 'GET', '/api/auth/me', cookie);
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, { user });
  assert.equal(me.headers['Cache-Control'], 'no-store');
  for (const secret of [token.access_token, token.refresh_token, config.clientSecret, id]) {
    assert.equal(JSON.stringify({ logs, me }).includes(secret), false);
  }
});

test('state é single-use mesmo enquanto a troca do code está em andamento', async t => {
  const { auth, provider } = setup(t);
  let finish;
  provider.exchangeCode = () => new Promise(resolve => { finish = resolve; });
  const start = auth.begin();
  const callback = { ...start, code: 'code' };
  const first = auth.complete(callback);
  await assert.rejects(auth.complete(callback), /expirado ou inválido/);
  finish(token);
  await first;
  assert.equal(auth.sessions.sessions.size, 1);
});

test('novo login troca ID e invalida a sessão anterior', async t => {
  const { auth } = setup(t);
  const old = sessionCookie(await login(auth));
  const fresh = sessionCookie(await login(auth, old));
  assert.notEqual(fresh, old);
  assert.equal((await request(auth, 'GET', '/api/auth/me', old)).status, 401);
  assert.equal((await request(auth, 'GET', '/api/auth/me', fresh)).status, 200);
});

test('me rejeita ausência, cookie duplicado, sessão inventada e sessão expirada', async t => {
  const { auth, advance, config } = setup(t);
  const cookie = sessionCookie(await login(auth));
  for (const invalid of ['', `${cookie}; ${cookie}`, `cylbot_session=${'x'.repeat(43)}`, 'cylbot_session=%invalid']) {
    assert.equal((await request(auth, 'GET', '/api/auth/me', invalid)).status, 401);
  }
  advance(config.sessionTtlSeconds * 1000);
  assert.equal((await request(auth, 'GET', '/api/auth/me', cookie)).status, 401);
  assert.equal(auth.sessions.sessions.size, 0);
});

test('logout exige POST e origem confiável, remove sessão e expira cookie', async t => {
  const { auth, config } = setup(t);
  const cookie = sessionCookie(await login(auth));
  assert.equal((await request(auth, 'GET', '/api/auth/logout', cookie)).status, 404);
  for (const origin of [undefined, 'https://attacker.example', 'null']) {
    assert.equal((await request(auth, 'POST', '/api/auth/logout', cookie, origin)).status, 403);
    assert.equal((await request(auth, 'GET', '/api/auth/me', cookie)).status, 200);
  }
  const res = await request(auth, 'POST', '/api/auth/logout', cookie, config.webOrigin);
  assert.equal(res.status, 204);
  assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
  assert.equal((await request(auth, 'GET', '/api/auth/me', cookie)).status, 401);
  assert.equal((await request(auth, 'POST', '/api/auth/logout', '', config.webOrigin)).status, 204);
});

test('HTTPS ativa Secure e CORS mantém origem explícita com credentials', async t => {
  const { auth, config } = setup(t, true);
  const start = await begin(auth);
  for (const cookie of start.response.headers['Set-Cookie']) assert.match(cookie, /; Secure$/);
  const response = await login(auth);
  assert.match(response.headers['Set-Cookie'][2], /; Secure$/);
  const me = await request(auth, 'GET', '/api/auth/me', sessionCookie(response), 'https://attacker.example');
  assert.equal(me.headers['Access-Control-Allow-Origin'], config.webOrigin);
  assert.equal(me.headers['Access-Control-Allow-Credentials'], 'true');
});

test('falhas externas não vazam tokens, secret, code ou mensagens em logs/redirect', async t => {
  const { auth, provider, logs, config } = setup(t);
  provider.exchangeCode = async () => { throw new Error(`${token.access_token} ${token.refresh_token} ${config.clientSecret} fake-code`); };
  const res = await login(auth);
  assert.match(res.headers.Location, /authError=login_failed$/);
  assert.equal(auth.sessions.sessions.size, 0);
  for (const secret of [token.access_token, token.refresh_token, config.clientSecret, 'fake-code']) {
    assert.equal(JSON.stringify({ logs, res }).includes(secret), false);
  }
});

test('OAuth não configurado não impede aplicação e recusa iniciar login', async t => {
  const { auth } = setup(t);
  auth.config.enabled = false;
  assert.equal((await request(auth, 'GET', '/api/auth/discord')).status, 503);
  assert.equal((await request(auth, 'GET', '/api/auth/me')).status, 401);
});

test('provider usa POST form no token endpoint e Bearer somente na busca do perfil', async () => {
  const config = loadEnv({ DISCORD_CLIENT_ID: user.id, DISCORD_OAUTH_CLIENT_SECRET: 'fake-secret' }, { requireDiscord: false }).auth;
  const requests = [];
  const provider = new DiscordOAuthProvider(config, async (url, options) => {
    requests.push({ url, ...options });
    return { ok: true, json: async () => requests.length === 1 ? token : { id: user.id, username: user.username, global_name: 'Display', avatar: 'a_' + 'a'.repeat(32), discriminator: '0' } };
  });
  assert.deepEqual(await provider.exchangeCode('private-code'), token);
  const profile = await provider.getUser(token.access_token);
  assert.equal(requests[0].url, 'https://discord.com/api/oauth2/token');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].body.get('grant_type'), 'authorization_code');
  assert.equal(requests[0].body.get('client_secret'), config.clientSecret);
  assert.equal(requests[0].body.get('code'), 'private-code');
  assert.equal(requests[1].url, 'https://discord.com/api/v10/users/@me');
  assert.equal(requests[1].headers.Authorization, `Bearer ${token.access_token}`);
  assert.equal(requests[1].redirect, 'error');
  assert(requests[1].signal instanceof AbortSignal);
  assert.equal(profile.displayName, 'Display');
  assert.match(profile.avatarUrl, /a_.*\.gif$/);
});

test('avatar padrão cobre contas migradas e discriminator legado; displayName tem fallback', async () => {
  for (const [discriminator, index] of [['0', Number((BigInt(user.id) >> 22n) % 6n)], ['1234', 4]]) {
    const provider = new DiscordOAuthProvider({}, async () => ({ ok: true, json: async () => ({ id: user.id, username: user.username, avatar: null, global_name: null, discriminator }) }));
    const profile = await provider.getUser('fake');
    assert.equal(profile.avatarUrl, `https://cdn.discordapp.com/embed/avatars/${index}.png`);
    assert.equal(profile.displayName, user.username);
  }
});

test('provider oculta erros externos e rejeita token/perfil inválidos', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('secret-response'); },
    async () => ({ ok: false, json: () => assert.fail('Body de erro não deve ser lido') }),
    async () => ({ ok: true, json: async () => null }),
  ]) {
    const provider = new DiscordOAuthProvider({}, fetchImpl);
    await assert.rejects(provider.exchangeCode('code'), error => error.statusCode === 502 && !error.message.includes('secret-response'));
    await assert.rejects(provider.getUser('fake'), error => error.statusCode === 502);
  }
});
