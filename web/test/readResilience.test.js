import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGuilds } from '../src/dashboard/dashboardApi.js';
import { readJson, retryAfterSeconds } from '../src/lib/readApi.js';
import { startPolling, emptyReadState, failedReadState } from '../src/lib/readPolling.js';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
class Visibility extends EventTarget { hidden = false; }

test('dashboard mantém última lista válida em 502/503, respeita 429 e recupera no próximo ciclo', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  let calls = 0; let state = emptyReadState;
  const guilds = [{ id: '123456789012345678', name: 'Guild', botInstalled: true, canManage: true }];
  t.mock.method(globalThis, 'fetch', async () => {
    const status = [200, 502, 503, 429, 200][calls++];
    return new Response(JSON.stringify({ guilds }), { status, headers: status === 429 ? { 'Retry-After': '120' } : {} });
  });
  const stop = startPolling({ interval: 60000, visibility: new Visibility(), load: getGuilds,
    onData: data => { state = { data, loading: false, error: '', updatedAt: Date.now() }; },
    onError: (error, terminal, recovery) => { state = failedReadState(state, error, terminal, recovery); } });
  t.after(stop);
  await flush(); assert.deepEqual(state.data, guilds);
  for (const status of [502, 503, 429]) {
    t.mock.timers.tick(60000); await flush();
    assert.deepEqual(state.data, guilds, `${status} não apaga lista`);
    assert.equal(state.updatedAt, 1000); assert(state.error); assert.equal(state.stopped, false);
  }
  t.mock.timers.tick(119999); await flush(); assert.equal(calls, 4);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 5); assert.equal(state.error, '');
});

test('falhas transitórias consecutivas usam 15/30/60 segundos e sucesso reinicia intervalo', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const delays = []; let calls = 0;
  const stop = startPolling({ visibility: new Visibility(), load: async () => {
    calls++; if (calls < 5) throw Object.assign(new Error('temporary'), { status: 502 }); return 'ok';
  }, onData: () => {}, onError: (error, terminal, recovery) => delays.push(recovery.retryAt - Date.now()) });
  t.after(stop);
  await flush();
  for (const delay of [15000, 30000, 60000, 60000]) { t.mock.timers.tick(delay); await flush(); }
  assert.deepEqual(delays, [15000, 30000, 60000, 60000]); assert.equal(calls, 5);
  t.mock.timers.tick(15000); await flush(); assert.equal(calls, 6);
});

test('401/403/404 apagam dados e param; 500/400/erro interno param sem retry e preservam dados sinalizados', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  for (const status of [401, 403, 404, 500, 400, undefined]) {
    let calls = 0; let state = { data: ['previous'], updatedAt: 1000 };
    const stop = startPolling({ visibility: new Visibility(), load: async () => { calls++; throw Object.assign(new Error('failure'), { status }); },
      onData: assert.fail, onError: (error, terminal, recovery) => { state = failedReadState(state, error, terminal, recovery); } });
    await flush(); t.mock.timers.tick(300000); await flush();
    assert.equal(calls, 1); assert.equal(state.stopped, true); assert.equal(state.retryAt, null);
    assert.deepEqual(state.data, [401, 403, 404].includes(status) ? null : ['previous']);
    assert.equal(state.error, 'failure'); stop();
  }
});

test('GET tem timeout total de 30s e aborto do chamador cancela a chamada sem retry interno', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let calls = 0; const signals = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++; signals.push(options.signal);
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  });
  const timedOut = assert.rejects(readJson('/api/dashboard/guilds', { messages: {} }), error => error.retryable === true);
  t.mock.timers.tick(30000); await timedOut;
  assert.equal(signals[0].aborted, true); assert.equal(calls, 1);
  const controller = new AbortController();
  const cancelled = assert.rejects(readJson('/api/dashboard/guilds', { messages: {}, signal: controller.signal }), error => error.name === 'AbortError' && !error.retryable);
  controller.abort(); await cancelled;
  assert.equal(signals[1].aborted, true); assert.equal(calls, 2);
});

test('API de dashboard expõe status/Retry-After sem mensagem upstream nem retry de 401/403', async t => {
  assert.equal(retryAfterSeconds('Thu, 24 Sep 2026 12:00:30 GMT', Date.parse('2026-09-24T12:00:00Z')), 30);
  assert.equal(retryAfterSeconds('invalid'), 0);
  for (const status of [401, 403, 404, 429, 500, 502, 503]) {
    let calls = 0;
    const mock = t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('{"error":"secret"}', { status, headers: { 'Retry-After': '90' } }); });
    await assert.rejects(getGuilds(), error => error.status === status && error.retryAfter === 90 && !error.message.includes('secret') && error.reloginRequired === (status === 401));
    assert.equal(calls, 1); mock.mock.restore();
  }
});
