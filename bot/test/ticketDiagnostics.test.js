const { test } = require('node:test');
const assert = require('node:assert/strict');
const { interactionDetails, errorDetails } = require('../src/lib/ticketDiagnostics');

test('diagnóstico omite custom IDs inválidos, nomes/códigos arbitrários e payloads em causas cíclicas', () => {
  const secret = 'postgresql://user:password@host/database';
  assert.deepEqual(interactionDetails(`ticket:claim:${secret}`), { action: 'invalid', customIdAction: 'ticket:invalid' });
  const error = Object.assign(new Error(secret), { name: secret, code: secret, requestBody: { content: secret } });
  error.cause = error;
  assert.deepEqual(errorDetails(error), { errorName: 'Error', errorCode: undefined });
  assert(!JSON.stringify(errorDetails(error)).includes(secret));
});

test('diagnóstico mantém classe PostgreSQL e SQLSTATE sem query, detalhe ou credenciais', () => {
  class DatabaseError extends Error { constructor() { super('SQL e dados privados'); this.name = 'error'; this.code = '23505'; } }
  const error = Object.assign(new Error('query privada'), { name: 'DrizzleQueryError', cause: new DatabaseError() });
  const data = errorDetails(error);
  assert.equal(data.errorName, 'DrizzleQueryError');
  assert.equal(data.causeErrorName, 'DatabaseError');
  assert.equal(data.causeErrorCode, '23505');
  assert(!/SQL|privad/.test(JSON.stringify(data)));
});
