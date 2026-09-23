require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { once } = require('node:events');
const { loadEnv } = require('../src/config/env');
const { createRequestHandler } = require('../src/api/server');

test('proxy real do Vite preserva Origin local/Codespaces e backend rejeita outro Codespace', async t => {
  const webRoot = path.resolve(__dirname, '../../web');
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [webRoot] })).href);
  const config = loadEnv({ CODESPACES: 'true', CODESPACE_NAME: 'proxy-test' }, { requireDiscord: false });
  const origins = [];
  const handler = createRequestHandler({ services: { auth: { config: config.auth, sessions: { remove() {} } } } });
  const backend = http.createServer((request, response) => { origins.push(request.headers.origin); return handler(request, response); });
  t.after(() => new Promise(resolve => { backend.close(resolve); backend.closeAllConnections(); }));
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const vite = await createServer({ root: webRoot, configFile: path.join(webRoot, 'vite.config.js'),
    server: { host: '127.0.0.1', port: 0, watch: null,
      proxy: { '/api': { target: `http://127.0.0.1:${backend.address().port}` } } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  t.after(() => vite.close());
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/api/auth/logout`;
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173',
    'https://proxy-test-5173.app.github.dev', 'https://foreign-space-5173.app.github.dev', undefined]) {
    const response = await fetch(url, { method: 'POST', headers: origin ? { Origin: origin } : {} });
    await response.text();
    assert.equal(origins.at(-1), origin, 'O proxy deve preservar inclusive a ausência de Origin');
    assert.equal(response.status, config.auth.allowedOrigins.includes(origin) ? 204 : 403);
    assert.equal(response.headers.get('access-control-allow-origin'), origin === undefined ? config.auth.webOrigin : config.auth.allowedOrigins.includes(origin) ? origin : null);
  }
});
