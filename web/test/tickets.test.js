import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startPolling } from '../src/tickets/polling.js';
import {
  getMessages,
  getTicket,
  getTickets,
  postTicketMessage,
} from '../src/tickets/ticketsApi.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
class Visibility extends EventTarget {
  hidden = false;
  change(hidden) { this.hidden = hidden; this.dispatchEvent(new Event('visibilitychange')); }
}

test('POST de mensagem envia somente o contrato permitido e usa sessão autenticada', async t => {
  const calls = [];

  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });

    return new Response(JSON.stringify({
      message: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        content: 'Olá pelo painel',
        origin: 'WEB',
        authorType: 'USER',
        deliveryStatus: 'SENT',
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  const result = await postTicketMessage(
    '111111111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    {
      clientMessageId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      content: 'Olá pelo painel',
    },
  );

  assert.equal(calls.length, 1);

  assert.equal(
    calls[0].url,
    '/api/tickets/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/messages',
  );

  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(
    calls[0].options.headers['Content-Type'],
    'application/json',
  );

  assert.deepEqual(
    JSON.parse(calls[0].options.body),
    {
      guildId: '111111111111111111',
      clientMessageId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      content: 'Olá pelo painel',
    },
  );

  assert.equal(result.message.origin, 'WEB');
  assert.equal(result.message.deliveryStatus, 'SENT');
});

test('POST de mensagem não reflete erro privado do backend', async t => {
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(
      JSON.stringify({
        error: 'database password secret',
      }),
      {
        status: 503,
      },
    ),
  );

  await assert.rejects(
    postTicketMessage(
      '111111111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      {
        clientMessageId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        content: 'Teste',
      },
    ),
    error =>
      error.status === 503 &&
      !error.message.includes('database password secret'),
  );
});

test('polling serializa ciclos, pausa em aba oculta, aborta ao sair e ignora resposta antiga', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const visibility = new Visibility(); const calls = []; const data = [];
  const stop = startPolling({ visibility, load: signal => new Promise(resolve => calls.push({ signal, resolve })),
    onData: result => data.push(result), onError: assert.fail });
  t.mock.timers.tick(60000); assert.equal(calls.length, 1);
  calls[0].resolve('first'); await flush();
  t.mock.timers.tick(15000); assert.equal(calls.length, 2);
  visibility.change(true); assert.equal(calls[1].signal.aborted, true);
  t.mock.timers.tick(60000); assert.equal(calls.length, 2);
  visibility.change(false); assert.equal(calls.length, 3);
  calls[1].resolve('stale'); calls[2].resolve('fresh'); await flush();
  assert.deepEqual(data, ['first', 'fresh']);
  t.mock.timers.tick(15000); assert.equal(calls.length, 4);
  stop(); assert.equal(calls[3].signal.aborted, true);
  calls[3].resolve('unmounted'); await flush();
  t.mock.timers.tick(60000); assert.equal(calls.length, 4);
  assert.deepEqual(data, ['first', 'fresh']);
});

test('401/403/404 encerram polling; erros temporários retomam respeitando Retry-After', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  for (const status of [401, 403, 404]) {
    let calls = 0; const errors = []; const visibility = new Visibility();
    const stop = startPolling({ visibility, load: async () => { calls++; throw Object.assign(new Error('denied'), { status }); },
      onData: assert.fail, onError: (error, terminal) => errors.push(terminal) });
    await flush(); t.mock.timers.tick(60000); visibility.change(true); visibility.change(false);
    assert.equal(calls, 1); assert.deepEqual(errors, [true]); stop();
  }
  let calls = 0; const errors = []; const data = []; const visibility = new Visibility();
  const stop = startPolling({ visibility, load: async () => {
    calls++; if (calls === 1) throw Object.assign(new Error('busy'), { status: 429, retryAfter: 60 }); return 'ok';
  }, onData: result => data.push(result), onError: (error, terminal) => errors.push(terminal) });
  await flush(); t.mock.timers.tick(15000);
  visibility.change(true); visibility.change(false); assert.equal(calls, 1);
  t.mock.timers.tick(44999); assert.equal(calls, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
  assert.deepEqual(data, ['ok']); assert.deepEqual(errors, [false]); stop();
});

test('API usa somente GET autenticado, parâmetros de página e AbortSignal', async t => {
  const calls = []; const signal = new AbortController().signal;
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return new Response('{}'); });
  await getTickets('guild', null, signal); await getTicket('guild', 'ticket', signal); await getMessages('guild', 'ticket', 'cursor', signal);
  assert.deepEqual(calls.map(call => call.url), ['/api/tickets?guildId=guild&limit=25', '/api/tickets/ticket?guildId=guild',
    '/api/tickets/ticket/messages?guildId=guild&before=cursor&limit=50']);
  for (const { options } of calls) {
    assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'include');
    assert.equal(options.cache, 'no-store'); assert(options.signal instanceof AbortSignal); assert.equal(options.body, undefined);
  }
});

test('API distingue autorização, indisponibilidade e limite sem refletir erro privado do servidor', async t => {
  for (const status of [401, 403, 404, 429, 502, 503, 500]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response('{"error":"private database details"}', { status, headers: { 'Retry-After': '60' } }));
    await assert.rejects(getTickets('guild'), error => error.status === status && error.retryAfter === 60 && !error.message.includes('private'));
    mock.mock.restore();
  }
});
