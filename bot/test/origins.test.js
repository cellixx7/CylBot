require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadEnv } = require('../src/config/env');
const { requireTrustedOrigin } = require('../src/api/http/auth');
const { createRequestHandler } = require('../src/api/server');

const codespace = { CODESPACES: 'true', CODESPACE_NAME: 'current-space' };
const currentOrigin = 'https://current-space-5173.app.github.dev';
const foreignOrigin = 'https://other-space-5173.app.github.dev';
const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const authConfig = source => loadEnv(source, { requireDiscord: false }).auth;
const checkOrigin = (config, origin) => requireTrustedOrigin({ headers: { origin } }, config.allowedOrigins);

test('DEV aceita WEB_ORIGIN, localhost, loopback e somente o Codespace atual', () => {
  const config = authConfig({ ...codespace, WEB_ORIGIN: 'https://cyl.example' });
  assert.deepEqual(config.allowedOrigins, ['https://cyl.example', ...localOrigins, currentOrigin]);
  for (const origin of config.allowedOrigins) assert.doesNotThrow(() => checkOrigin(config, origin));
  for (const origin of [foreignOrigin, 'https://attacker.example', undefined, 'null', '',
    `${currentOrigin}.attacker.example`, `${currentOrigin}/`, 'http://localhost:5174',
    'https://cyl.example/path', ['https://cyl.example'], 'https://cyl.example, https://attacker.example']) {
    assert.throws(() => checkOrigin(config, origin), { statusCode: 403 });
  }
});

test('detecção mantém callback, Secure, domínio de forwarding e overrides coerentes', () => {
  const detected = authConfig(codespace);
  assert.equal(detected.webOrigin, currentOrigin);
  assert.equal(detected.redirectUri, `${currentOrigin}/api/auth/discord/callback`);
  assert.equal(detected.secure, true);
  const custom = authConfig({ ...codespace, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'preview.example' });
  assert.equal(custom.webOrigin, 'https://current-space-5173.preview.example');
  assert.throws(() => checkOrigin(custom, currentOrigin), { statusCode: 403 });
  const explicit = authConfig({ ...codespace, WEB_ORIGIN: 'https://cyl.example',
    DISCORD_OAUTH_REDIRECT_URI: 'https://cyl.example/api/auth/discord/callback' });
  assert.equal(explicit.webOrigin, 'https://cyl.example');
  assert.equal(explicit.redirectUri, 'https://cyl.example/api/auth/discord/callback');
  assert(explicit.allowedOrigins.includes(currentOrigin));
  const local = authConfig({});
  assert.equal(local.webOrigin, localOrigins[0]);
  assert.equal(local.secure, false);
  assert.deepEqual(local.allowedOrigins, localOrigins);
});

test('Codespaces incompleto, desativado ou inválido não autoriza origens pelo formato', () => {
  for (const source of [{}, { CODESPACE_NAME: 'current-space' }, { CODESPACES: 'true' },
    { ...codespace, CODESPACES: 'false' }, { ...codespace, CODESPACE_NAME: 'invalid/name' },
    { ...codespace, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'host/path' }]) {
    assert.deepEqual(authConfig(source).allowedOrigins, localOrigins);
  }
});

test('produção aceita apenas WEB_ORIGIN exata, mesmo dentro de Codespaces', () => {
  const config = authConfig({ ...codespace, NODE_ENV: 'production', WEB_ORIGIN: 'https://cyl.example' });
  assert.deepEqual(config.allowedOrigins, ['https://cyl.example']);
  assert.doesNotThrow(() => checkOrigin(config, config.webOrigin));
  for (const origin of [...localOrigins, currentOrigin, foreignOrigin, undefined]) {
    assert.throws(() => checkOrigin(config, origin), { statusCode: 403 });
  }
  // A detecção continua disponível; produção não acrescenta origens de DEV.
  assert.deepEqual(authConfig({ ...codespace, NODE_ENV: 'production' }).allowedOrigins, [currentOrigin]);
});

test('HTTP e logout usam a mesma allowlist que CORS, preservando headers e cookies', async () => {
  for (const environment of ['development', 'production']) {
    const config = authConfig({ ...codespace, NODE_ENV: environment, WEB_ORIGIN: 'https://cyl.example' });
    let removals = 0;
    const handler = createRequestHandler({ services: { auth: { config, sessions: { remove: () => removals++ } } } });
    for (const origin of ['https://cyl.example', ...localOrigins, currentOrigin, foreignOrigin, 'null', undefined]) {
      const allowed = config.allowedOrigins.includes(origin);
      for (const method of ['POST', 'OPTIONS']) {
        const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; },
          writeHead(status) { this.status = status; return this; }, end() {} };
        const before = removals;
        await handler({ method, url: '/api/auth/logout', headers: { origin } }, response);
        assert.equal(response.status, method === 'OPTIONS' || allowed ? 204 : 403);
        assert.equal(response.headers['Access-Control-Allow-Origin'], origin === undefined ? config.webOrigin : allowed ? origin : undefined);
        assert.equal(response.headers.Vary, 'Origin');
        assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
        if (allowed && method === 'POST') {
          assert.equal(removals, before + 1);
          assert.match(response.headers['Set-Cookie'], /HttpOnly/);
          assert.match(response.headers['Set-Cookie'], /Secure/);
        } else assert.equal(removals, before);
      }
    }
  }
});
