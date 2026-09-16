const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadEnv } = require('../src/config/env');
const OpenRouterService = require('../src/services/openRouterService');

function provider() {
  return new OpenRouterService(loadEnv({}, { requireDiscord: false }).openRouter);
}

test('saída content aceita 2000 caracteres e rejeita excesso ou conteúdo vazio', () => {
  const ai = provider();
  assert.equal(ai.validateOutput({ content: 'x'.repeat(2000) }, 'content').content.length, 2000);
  assert.equal(ai.validateOutput({ content: ' Texto ' }, 'content').content, 'Texto');
  for (const content of ['', '  ', 'x'.repeat(2001), null]) {
    assert.throws(() => ai.validateOutput({ content }, 'content'));
  }
});

test('saída embed protege limites de título, descrição e campos', () => {
  const ai = provider();
  const field = { name: 'n'.repeat(256), value: 'v'.repeat(1024), inline: true };
  const valid = { title: 't'.repeat(256), description: 'd'.repeat(4096), fields: [field] };
  assert.deepEqual(ai.validateOutput(valid, 'embed'), valid);
  assert.equal(ai.validateOutput({ description: ' Texto ', fields: null }, 'embed').description, 'Texto');
  assert.equal(ai.validateOutput({ description: 'Texto', fields: Array.from({ length: 25 }, () => ({ name: 'n', value: 'v' })) }, 'embed').fields.length, 25);
  for (const output of [
    { ...valid, title: 't'.repeat(257) }, { ...valid, description: 'd'.repeat(4097) },
    { ...valid, description: ' ' }, { ...valid, fields: {} },
    { ...valid, fields: [{ ...field, name: 'n'.repeat(257) }] },
    { ...valid, fields: [{ ...field, value: 'v'.repeat(1025) }] },
    { ...valid, fields: [null] }, { ...valid, fields: Array(26).fill({ name: 'n', value: 'v' }) },
  ]) assert.throws(() => ai.validateOutput(output, 'embed'));
});
