import assert from 'node:assert/strict';
import test from 'node:test';
import { getCommunitySnapshot, unavailableCommunitySnapshot } from '../src/home/communityApi.js';

test('community preview normaliza presença, canais e métricas públicas', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/community-preview');
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'same-origin');
    return new Response(JSON.stringify({
      bot: { online: true },
      communityUrl: 'https://discord.com/channels/123',
      channels: { avisos: { url: 'https://discord.com/channels/123/456' } },
      metrics: { commands: 12, servers: 34, ticketCommands: 56 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  assert.deepEqual(await getCommunitySnapshot(), {
    loading: false,
    available: true,
    online: true,
    communityUrl: 'https://discord.com/channels/123',
    channels: { avisos: { url: 'https://discord.com/channels/123/456' } },
    metrics: { commands: 12, servers: 34, ticketCommands: 56 },
  });
});

test('community preview distingue API indisponível de bot offline sem apagar métricas anteriores', () => {
  const previous = {
    loading: true,
    available: true,
    online: true,
    communityUrl: 'https://discord.com/channels/123',
    channels: {},
    metrics: { commands: 12, servers: 34, ticketCommands: 56 },
  };

  assert.deepEqual(unavailableCommunitySnapshot(previous), {
    ...previous,
    loading: false,
    available: false,
    online: false,
  });
});
