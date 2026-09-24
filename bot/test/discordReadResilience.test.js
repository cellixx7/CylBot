require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DiscordOAuthProvider } = require('../src/providers/discordOAuthProvider');
const { logger } = require('../src/lib/logger');
const { retryAfterSeconds } = require('../src/providers/discordReadErrors');

const guild = { id: '123456789012345678', name: 'Guild', permissions: '0' };
const success = () => ({ ok: true, status: 200, json: async () => [guild] });
const failure = (status, retryAfter) => ({ ok: false, status, headers: new Headers(retryAfter ? { 'Retry-After': retryAfter } : {}),
  json: () => assert.fail('body externo não deve ser lido') });

test('GET guilds recupera 502/503/504, timeout e conexão resetada com exatamente um retry', async t => {
  const logs = [];
  for (const level of ['warn', 'info']) t.mock.method(logger, level, (event, details) => logs.push({ event, details }));
  for (const first of [failure(502), failure(503), failure(504),
    Object.assign(new Error('private-token'), { name: 'TimeoutError' }),
    Object.assign(new TypeError('private-token'), { cause: { code: 'ECONNRESET' } })]) {
    let calls = 0; const sleeps = [];
    const provider = new DiscordOAuthProvider({}, async (url, options) => {
      calls++; assert.equal(options.method, 'GET'); assert(options.signal instanceof AbortSignal);
      if (calls === 1) { if (first instanceof Error) throw first; return first; } return success();
    }, { sleep: async ms => sleeps.push(ms), random: () => 0.5 });
    assert.equal((await provider.getCurrentUserGuilds('private-token'))[0].id, guild.id);
    assert.equal(calls, 2); assert.deepEqual(sleeps, [300]);
  }
  assert.equal(logs.filter(log => log.event === 'discord.guilds_retry').length, 5);
  assert.equal(logs.filter(log => log.event === 'discord.guilds_response_recovered').length, 5);
  assert.equal(JSON.stringify(logs).includes('private-token'), false);
});

test('retry se esgota na segunda falha; não repete 401/403/404/429/500, JSON inválido ou erro desconhecido', async t => {
  t.mock.method(logger, 'warn', () => {});
  for (const [response, status, expectedCalls] of [[failure(502), 502, 2], [failure(401), 401, 1], [failure(403), 401, 1],
    [failure(404), 404, 1], [failure(429, '120'), 429, 1], [failure(500), 502, 1],
    [{ ok: true, json: async () => { throw new SyntaxError('secret'); } }, 502, 1], [new Error('secret'), 502, 1]]) {
    let calls = 0;
    const provider = new DiscordOAuthProvider({}, async () => { calls++; if (response instanceof Error) throw response; return response; }, { sleep: async () => {} });
    await assert.rejects(provider.getCurrentUserGuilds('fake'), error => error.statusCode === status && !error.message.includes('secret'));
    assert.equal(calls, expectedCalls);
  }
});

test('Retry-After impede retry precoce e é repassado em segundos, inclusive HTTP-date', async t => {
  t.mock.method(logger, 'warn', () => {});
  assert.equal(retryAfterSeconds('Thu, 24 Sep 2026 12:00:30 GMT', Date.parse('2026-09-24T12:00:00Z')), 30);
  assert.equal(retryAfterSeconds('0.2'), 1); assert.equal(retryAfterSeconds('invalid'), undefined);
  for (const status of [429, 503]) {
    let calls = 0;
    const provider = new DiscordOAuthProvider({}, async () => { calls++; return failure(status, '45'); }, { sleep: () => assert.fail('retry não deve ignorar Retry-After') });
    await assert.rejects(provider.getCurrentUserGuilds('fake'), error => error.statusCode === (status === 429 ? 429 : 502) && error.retryAfter === 45);
    assert.equal(calls, 1);
  }
});

test('troca de code OAuth continua sem retry de POST', async () => {
  let calls = 0;
  const provider = new DiscordOAuthProvider({}, async (url, options) => { calls++; assert.equal(options.method, 'POST'); return failure(502); });
  await assert.rejects(provider.exchangeCode('fake-code'), error => error.statusCode === 502);
  assert.equal(calls, 1);
});
