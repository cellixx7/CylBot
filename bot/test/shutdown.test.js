const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createShutdown } = require('../src/app/shutdown');

test('shutdown é idempotente e fecha API, Discord e banco uma única vez', async () => {
  const calls = { server: 0, discord: 0, ticketAI: 0, database: 0 };
  const server = {
    listening: true,
    closeIdleConnections() {},
    close(callback) { calls.server++; callback(); },
  };
  const client = {
    services: {
      ticketAIMessages: { stop: async () => { calls.ticketAI++; } },
      database: { close: async () => { calls.database++; } },
    },
    destroy: () => { calls.discord++; },
  };
  const logger = { info() {}, error() {} };
  const shutdown = createShutdown({ getServer: () => server, getClient: () => client, logger, timeoutMs: 50 });
  await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
  assert.deepEqual(calls, { server: 1, discord: 1, ticketAI: 1, database: 1 });
});
