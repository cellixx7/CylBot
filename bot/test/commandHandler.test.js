require('./helpers/isolatedConfig');
const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { handleCommand } = require('../src/handlers/commandHandler');
const { logger } = require('../src/lib/logger');

function interaction(overrides = {}) {
  return {
    commandName: 'embed', guildId: 'guild', channelId: 'channel', user: { id: 'user' },
    replied: false, deferred: false, ...overrides,
  };
}

test('interação expirada não tenta responder novamente', async t => {
  t.mock.method(logger, 'warn', () => {});
  let replies = 0;
  const expired = Object.assign(new Error('Unknown interaction'), { code: 10062 });
  await handleCommand(interaction({ reply: async () => { replies++; } }), [
    { data: { name: 'embed' }, execute: async () => { throw expired; } },
  ]);
  assert.equal(replies, 0);
});

test('falha ao responder o erro não derruba o processo', async t => {
  t.mock.method(logger, 'error', () => {});
  const warning = t.mock.method(logger, 'warn', () => {});
  const acknowledged = Object.assign(new Error('Interaction has already been acknowledged.'), { code: 40060 });
  await handleCommand(interaction({ reply: async () => { throw acknowledged; } }), [
    { data: { name: 'embed' }, execute: async () => { throw new Error('Falha do comando'); } },
  ]);
  assert.equal(warning.mock.callCount(), 1);
});

test('fallback usa a flag ephemeral atual do Discord.js', async t => {
  t.mock.method(logger, 'error', () => {});
  let payload;
  await handleCommand(interaction({ reply: async value => { payload = value; } }), [
    { data: { name: 'embed' }, execute: async () => { throw new Error('Falha do comando'); } },
  ]);
  assert.deepEqual(payload, {
    content: 'Não foi possível executar este comando.',
    flags: MessageFlags.Ephemeral,
  });
});
