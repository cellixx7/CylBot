import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startPolling } from '../src/tickets/polling.js';
import {
  getMessages,
  getMessageRevisions,
  getTicket,
  getTickets,
  getTicketAIConfig,
  getTicketAIStatus,
  pauseTicketAI,
  postTicketMessage,
  resumeTicketAI,
  retryTicketMessage,
  runTicketAISuggestion,
  ticketAction,
  updateTicketAIConfig,
} from '../src/tickets/ticketsApi.js';
import { ticketConversationMode } from '../src/tickets/messageReconciliation.js';

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
};

class Visibility extends EventTarget {
  hidden = false;

  change(hidden) {
    this.hidden = hidden;
    this.dispatchEvent(
      new Event('visibilitychange'),
    );
  }
}

test('POST de mensagem envia somente o contrato permitido e usa sessÃ£o autenticada', async t => {
  const calls = [];

  t.mock.method(
    globalThis,
    'fetch',
    async (url, options) => {
      calls.push({
        url,
        options,
      });

      return new Response(
        JSON.stringify({
          message: {
            id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            content: 'OlÃ¡ pelo painel',
            origin: 'WEB',
            authorType: 'USER',
            deliveryStatus: 'SENT',
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    },
  );

  const result =
    await postTicketMessage(
      '111111111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      {
        clientMessageId:
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        content:
          'OlÃ¡ pelo painel',
      },
    );

  assert.equal(
    calls.length,
    1,
  );

  assert.equal(
    calls[0].url,
    '/api/tickets/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/messages',
  );

  assert.equal(
    calls[0].options.method,
    'POST',
  );

  assert.equal(
    calls[0].options.credentials,
    'include',
  );

  assert.equal(
    calls[0].options.cache,
    'no-store',
  );

  assert.equal(
    calls[0].options.headers[
      'Content-Type'
    ],
    'application/json',
  );

  assert.deepEqual(
    JSON.parse(
      calls[0].options.body,
    ),
    {
      guildId:
        '111111111111111111',
      clientMessageId:
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      content:
        'OlÃ¡ pelo painel',
    },
  );

  assert.equal(
    result.message.origin,
    'WEB',
  );

  assert.equal(
    result.message.deliveryStatus,
    'SENT',
  );
});

test('POST de mensagem nÃ£o reflete erro privado do backend', async t => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          error:
            'database password secret',
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
        clientMessageId:
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        content: 'Teste',
      },
    ),
    error =>
      error.status === 503 &&
      !error.message.includes(
        'database password secret',
      ),
  );
});

test('retry de mensagem usa messageId e envia somente guildId', async t => {
  const calls = [];

  t.mock.method(
    globalThis,
    'fetch',
    async (url, options) => {
      calls.push({
        url,
        options,
      });

      return new Response(
        JSON.stringify({
          message: {
            id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            content:
              'Mensagem reenviada',
            origin: 'WEB',
            authorType: 'USER',
            deliveryStatus: 'SENT',
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type':
              'application/json',
          },
        },
      );
    },
  );

  const result =
    await retryTicketMessage(
      '111111111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
    );

  assert.equal(
    calls.length,
    1,
  );

  assert.equal(
    calls[0].url,
    '/api/tickets/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/messages/cccccccc-cccc-cccc-cccc-cccccccccccc/retry',
  );

  assert.equal(
    calls[0].options.method,
    'POST',
  );

  assert.equal(
    calls[0].options.credentials,
    'include',
  );

  assert.equal(
    calls[0].options.cache,
    'no-store',
  );

  assert.equal(
    calls[0].options.headers[
      'Content-Type'
    ],
    'application/json',
  );

  assert.deepEqual(
    JSON.parse(
      calls[0].options.body,
    ),
    {
      guildId:
        '111111111111111111',
    },
  );

  assert.equal(
    result.message.id,
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
  );

  assert.equal(
    result.message.deliveryStatus,
    'SENT',
  );
});

test('polling serializa ciclos, pausa em aba oculta, aborta ao sair e ignora resposta antiga', async t => {
  t.mock.timers.enable({
    apis: ['setTimeout', 'Date'],
    now: 1000,
  });

  const visibility =
    new Visibility();

  const calls = [];
  const data = [];

  const stop =
    startPolling({
      visibility,

      load: signal =>
        new Promise(resolve =>
          calls.push({
            signal,
            resolve,
          }),
        ),

      onData: result =>
        data.push(result),

      onError:
        assert.fail,
    });

  t.mock.timers.tick(60000);

  assert.equal(
    calls.length,
    1,
  );

  calls[0].resolve('first');

  await flush();

  t.mock.timers.tick(15000);

  assert.equal(
    calls.length,
    2,
  );

  visibility.change(true);

  assert.equal(
    calls[1].signal.aborted,
    true,
  );

  t.mock.timers.tick(60000);

  assert.equal(
    calls.length,
    2,
  );

  visibility.change(false);

  assert.equal(
    calls.length,
    3,
  );

  calls[1].resolve('stale');
  calls[2].resolve('fresh');

  await flush();

  assert.deepEqual(
    data,
    ['first', 'fresh'],
  );

  t.mock.timers.tick(15000);

  assert.equal(
    calls.length,
    4,
  );

  stop();

  assert.equal(
    calls[3].signal.aborted,
    true,
  );

  calls[3].resolve(
    'unmounted',
  );

  await flush();

  t.mock.timers.tick(60000);

  assert.equal(
    calls.length,
    4,
  );

  assert.deepEqual(
    data,
    ['first', 'fresh'],
  );
});

test('401/403/404 encerram polling; erros temporÃ¡rios retomam respeitando Retry-After', async t => {
  t.mock.timers.enable({
    apis: ['setTimeout', 'Date'],
    now: 1000,
  });

  for (
    const status of [
      401,
      403,
      404,
    ]
  ) {
    let calls = 0;
    const errors = [];
    const visibility =
      new Visibility();

    const stop =
      startPolling({
        visibility,

        load: async () => {
          calls++;

          throw Object.assign(
            new Error('denied'),
            {
              status,
            },
          );
        },

        onData:
          assert.fail,

        onError: (
          error,
          terminal,
        ) =>
          errors.push(
            terminal,
          ),
      });

    await flush();

    t.mock.timers.tick(
      60000,
    );

    visibility.change(
      true,
    );

    visibility.change(
      false,
    );

    assert.equal(
      calls,
      1,
    );

    assert.deepEqual(
      errors,
      [true],
    );

    stop();
  }

  let calls = 0;

  const errors = [];
  const data = [];

  const visibility =
    new Visibility();

  const stop =
    startPolling({
      visibility,

      load: async () => {
        calls++;

        if (calls === 1) {
          throw Object.assign(
            new Error('busy'),
            {
              status: 429,
              retryAfter: 60,
            },
          );
        }

        return 'ok';
      },

      onData: result =>
        data.push(result),

      onError: (
        error,
        terminal,
      ) =>
        errors.push(
          terminal,
        ),
    });

  await flush();

  t.mock.timers.tick(15000);

  visibility.change(true);
  visibility.change(false);

  assert.equal(
    calls,
    1,
  );

  t.mock.timers.tick(
    44999,
  );

  assert.equal(
    calls,
    1,
  );

  t.mock.timers.tick(1);

  await flush();

  assert.equal(
    calls,
    2,
  );

  assert.deepEqual(
    data,
    ['ok'],
  );

  assert.deepEqual(
    errors,
    [false],
  );

  stop();
});

test('API usa somente GET autenticado, parÃ¢metros de pÃ¡gina e AbortSignal', async t => {
  const calls = [];

  const signal =
    new AbortController()
      .signal;

  t.mock.method(
    globalThis,
    'fetch',
    async (
      url,
      options,
    ) => {
      calls.push({
        url,
        options,
      });

      return new Response(
        '{}',
      );
    },
  );

  await getTickets(
    'guild',
    null,
    signal,
  );

  await getTicket(
    'guild',
    'ticket',
    signal,
  );

  await getMessages(
    'guild',
    'ticket',
    'cursor',
    signal,
  );

  await getMessageRevisions(
    'guild',
    'ticket',
    'message',
    signal,
  );

  assert.deepEqual(
    calls.map(
      call => call.url,
    ),
    [
      '/api/tickets?guildId=guild&limit=25',
      '/api/tickets/ticket?guildId=guild',
      '/api/tickets/ticket/messages?guildId=guild&before=cursor&limit=50',
      '/api/tickets/ticket/messages/message/revisions?guildId=guild',
    ],
  );

  for (
    const { options }
    of calls
  ) {
    assert.equal(
      options.method,
      'GET',
    );

    assert.equal(
      options.credentials,
      'include',
    );

    assert.equal(
      options.cache,
      'no-store',
    );

    assert(
      options.signal
      instanceof AbortSignal,
    );

    assert.equal(
      options.body,
      undefined,
    );
  }
});

test('conversation mode separates active tickets from closed history', () => {
  for (const status of ['OPEN', 'CLAIMED', 'REOPENED']) {
    assert.equal(ticketConversationMode(status), 'chat');
  }
  assert.equal(ticketConversationMode('CLOSED'), 'history');
});

test('API distingue autorizaÃ§Ã£o, indisponibilidade e limite sem refletir erro privado do servidor', async t => {
  for (
    const status of [
      401,
      403,
      404,
      429,
      502,
      503,
      500,
    ]
  ) {
    const mock =
      t.mock.method(
        globalThis,
        'fetch',
        async () =>
          new Response(
            '{"error":"private database details"}',
            {
              status,
              headers: {
                'Retry-After':
                  '60',
              },
            },
          ),
      );

    await assert.rejects(
      getTickets(
        'guild',
      ),
      error =>
        error.status ===
          status &&
        error.retryAfter ===
          60 &&
        !error.message.includes(
          'private',
        ),
    );

    mock.mock.restore();
  }
});

test('ticket action posts only the action contract', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ ticket: { status: 'CLOSED' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const result = await ticketAction(
    '111111111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'close',
    { reason: 'Resolved', summary: 'Guidance sent' },
  );

  assert.equal(calls[0].url, '/api/tickets/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/actions/close');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    guildId: '111111111111111111', reason: 'Resolved', summary: 'Guidance sent',
  });
  assert.equal(result.ticket.status, 'CLOSED');
});

test('ticket AI API preserves status config and action contracts', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ status: { paused: false }, config: { enabled: true } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  });
  await getTicketAIStatus('111111111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  await runTicketAISuggestion('111111111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  await pauseTicketAI('111111111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  await resumeTicketAI('111111111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  await getTicketAIConfig('111111111111111111');
  await updateTicketAIConfig('111111111111111111', { enabled: true });
  assert.equal(calls[0].url, '/api/tickets/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/ai/status?guildId=111111111111111111');
  assert.deepEqual(JSON.parse(calls[1].options.body), { guildId: '111111111111111111' });
  assert.match(calls[1].url, /\/ai\/suggest$/);
  assert.match(calls[2].url, /\/ai\/pause$/);
  assert.match(calls[3].url, /\/ai\/resume$/);
  assert.equal(calls[4].url, '/api/tickets/ai/config/111111111111111111?');
  assert.deepEqual(JSON.parse(calls[5].options.body), { enabled: true });
  for (const call of calls) {
    assert.equal(call.options.credentials, 'include');
    assert.equal(call.options.cache, 'no-store');
  }
});

import { ticketAIControlsEnabled, ticketAIStatusText } from '../src/tickets/ticketAIView.js';

test('ticket AI view distinguishes active paused handoff unavailable and closed tickets', () => {
  assert.match(ticketAIStatusText({ available: true, enabled: true, autonomyLevel: 1, paused: false, escalated: false }), /^Ativa/);
  assert.match(ticketAIStatusText({ available: true, enabled: true, paused: true, escalated: false }), /^Pausada/);
  assert.match(ticketAIStatusText({ available: true, enabled: true, paused: true, escalated: true }), /^Atendimento humano/);
  assert.match(ticketAIStatusText({ available: false }), /^IA de tickets indispon/);
  assert.equal(ticketAIControlsEnabled({ available: true }, false), false);
  assert.equal(ticketAIControlsEnabled({ available: true }, true), true);
});
