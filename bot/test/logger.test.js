require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLogger } = require('../src/lib/logger');
const { loadEnv } = require('../src/config/env');
const OpenRouterService = require('../src/services/openRouterService');

function capture(options = {}) {
  const records = [];
  const logger = createLogger({ ...options, sink: (level, line) => records.push(JSON.parse(line)) });
  return { logger, records };
}

test('logger emite JSON estruturado e protege campos padrão contra sobrescrita', () => {
  const { logger, records } = capture();
  logger.info('announcement.sent', { guildId: 'guild', channelId: 'channel', userId: 'user', operation: 'announcement.send', level: 'error', service: 'fake', timestamp: 'fake' });
  assert.equal(records.length, 1);
  const record = records[0];
  assert.equal(record.event, 'announcement.sent');
  assert.equal(record.level, 'info');
  assert.equal(record.service, 'bot');
  assert.equal(record.guildId, 'guild');
  assert.equal(record.operation, 'announcement.send');
  assert(Number.isFinite(Date.parse(record.timestamp)));
});

test('Error preserva nome/mensagem/código sem stack e propriedades arbitrárias', () => {
  const { logger, records } = capture();
  const error = Object.assign(new TypeError('Falha controlada'), { code: 'EFAIL', status: 500, requestBody: 'private-body' });
  logger.error('test.failed', { error });
  assert.deepEqual(records[0].error, { name: 'TypeError', message: 'Falha controlada', code: 'EFAIL', status: 500 });
  assert.equal(JSON.stringify(records).includes('private-body'), false);
  assert.equal(records[0].error.stack, undefined);
});

test('redaction cobre campos aninhados, credenciais em mensagens e valores configurados', () => {
  const secrets = ['synthetic-discord-credential', 'synthetic-router-credential', 'synthetic-spotify-credential', 'synthetic-refresh-credential'];
  const { logger, records } = capture({ secrets });
  logger.error('test.failed', {
    DISCORD_TOKEN: secrets[0], openRouter: { apiKey: secrets[1] },
    spotify: { clientSecret: secrets[2], refresh_token: secrets[3] },
    headers: { Authorization: 'Bearer synthetic-header-value', Cookie: 'synthetic-cookie' },
    payload: 'private-payload', prompt: 'private-prompt',
    error: new Error(`Provider failed: ${secrets.join(' ')}; Bearer synthetic-bearer-value`),
    nested: [{ password: 'synthetic-password', safe: 'available' }],
  });
  const serialized = JSON.stringify(records);
  for (const value of [...secrets, 'synthetic-header-value', 'synthetic-cookie', 'private-payload', 'private-prompt', 'synthetic-bearer-value', 'synthetic-password']) {
    assert.equal(serialized.includes(value), false);
  }
  assert.equal(records[0].nested[0].safe, 'available');
  assert.match(records[0].error.message, /REDACTED/);
});

test('redaction oculta secret OAuth, tokens de sessão, state e ID de sessão', () => {
  const { logger, records } = capture({ secrets: ['fake-oauth-secret'] });
  logger.error('auth.test', {
    DISCORD_OAUTH_CLIENT_SECRET: 'fake-oauth-secret',
    discordAccessToken: 'fake-oauth-access', discordRefreshToken: 'fake-oauth-refresh',
    sessionId: 'fake-session-id', state: 'fake-oauth-state',
    error: new Error('Falha fake-oauth-secret'),
  });
  for (const value of ['fake-oauth-secret', 'fake-oauth-access', 'fake-oauth-refresh', 'fake-session-id', 'fake-oauth-state']) {
    assert.equal(JSON.stringify(records).includes(value), false);
  }
});

test('logger aplica nível mínimo incluindo info como default', () => {
  assert.throws(() => createLogger({ level: 'toString' }), /Nível de log inválido/);
  const names = ['debug', 'info', 'warn', 'error'];
  for (const level of names) {
    const { logger, records } = capture({ level });
    for (const name of names) logger[name](`test.${name}`);
    assert.deepEqual(records.map(r => r.level), names.slice(names.indexOf(level)));
  }
  const { logger, records } = capture();
  logger.debug('hidden'); logger.info('visible');
  assert.deepEqual(records.map(r => r.event), ['visible']);
});

test('contexto circular e falha de saída não interrompem a aplicação', () => {
  const { logger, records } = capture();
  const context = { count: 1n }; context.self = context;
  logger.info('test.circular', context);
  assert.equal(records[0].self, '[Circular]');
  const broken = createLogger({ sink: () => { throw new Error('Saída indisponível'); } });
  assert.doesNotThrow(() => broken.error('test.failed', { error: new Error('Falha') }));
});

test('resposta inválida OpenRouter registra metadados sem amostra do conteúdo', t => {
  const lines = [];
  t.mock.method(console, 'error', line => lines.push(JSON.parse(line)));
  const ai = new OpenRouterService(loadEnv({}, { requireDiscord: false }).openRouter);
  ai.logInvalidResponse('private-generated-text', 'JSON não encontrado');
  assert.equal(lines[0].event, 'openrouter.invalid_response');
  assert.equal(lines[0].responseLength, 22);
  assert.equal(JSON.stringify(lines).includes('private-generated-text'), false);
});

test('aplicação concentra console no logger', () => {
  const root = path.join(__dirname, '../src');
  function inspect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (file.endsWith('.js') && file !== path.join(root, 'lib/logger.js')) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /console\.(log|error|warn|debug)\s*\(/, file);
      }
    }
  }
  inspect(root);
});
