const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TextaAIService } = require('../src/services/textaAIService');
const TextaAISessionManager = require('../src/services/textaAISessionManager');

const input = { outputType: 'content', idea: 'Ideia', targetCharacters: 100 };
const actor = { userId: 'user', channelId: 'channel' };

function setup(generate = async () => ({ content: 'Texto' })) {
  const sessions = new TextaAISessionManager();
  const service = new TextaAIService({ ai: { generate }, sessions });
  return { service, sessions };
}

test('geração inicial prepara apenas os dados do provider e preserva outputType', async () => {
  for (const outputType of ['content', 'embed']) {
    let received;
    const output = outputType === 'content' ? { content: 'Texto' } : { description: 'Texto', fields: [] };
    const { service } = setup(async data => { received = data; return output; });
    const result = await service.generate({ ...input, outputType, ...actor });
    assert.equal(result, output);
    assert.deepEqual(received, { ...input, outputType, originalContext: 'Ideia', currentText: '', additionalContext: '' });
  }
});

test('revisão sem sessão reaproveita texto e contexto original', async () => {
  let received;
  const service = new TextaAIService({ ai: { generate: async data => { received = data; return { content: 'Revisado' }; } } });
  const result = await service.generate({ ...input, originalContext: 'Original', currentText: 'Texto atual', additionalContext: 'Incluir horário' });
  assert.equal(result.content, 'Revisado');
  assert.equal(received.originalContext, 'Original');
  assert.equal(received.currentText, 'Texto atual');
  assert.equal(received.additionalContext, 'Incluir horário');
});

test('entradas inválidas são rejeitadas antes de chamar IA', async () => {
  const { service } = setup(async () => assert.fail('Não deve chamar IA'));
  for (const data of [null, { ...input, outputType: 'bad' }, { ...input, idea: '' },
    { ...input, idea: 'x'.repeat(2001) }, { ...input, targetCharacters: 0 },
    { ...input, targetCharacters: 2001 }, { ...input, targetCharacters: 1.5 },
    { ...input, additionalContext: 'x'.repeat(2001) }]) {
    await assert.rejects(service.generate(data), { statusCode: 400 });
  }
});

test('opções do adapter preservam limites e normalização distintos', async () => {
  const calls = [];
  const { service } = setup(async data => { calls.push(data); return { content: 'Texto' }; });
  await service.generate({ ...input, idea: ' Ideia ', targetCharacters: 1 });
  assert.equal(calls[0].idea, ' Ideia ');
  assert.equal(calls[0].targetCharacters, 1);
  const web = { trimText: true, minTargetCharacters: 20, maxContextLength: 2000 };
  await assert.rejects(service.generate({ ...input, targetCharacters: 19 }, web), /entre 20 e 2.000/);
  await service.generate({ ...input, idea: ' Ideia ', targetCharacters: '20', currentText: ' Atual ' }, web);
  assert.equal(calls[1].idea, 'Ideia');
  assert.equal(calls[1].currentText, 'Atual');
  assert.equal(calls[1].targetCharacters, 20);
  await assert.rejects(service.generate({ ...input, currentText: 'x'.repeat(2001) }, web), /textos informados/);
  await assert.rejects(service.generate({ ...input, idea: '   ' }, web), /ideia deve/);
});

test('sessão guarda geração, revisão e texto de embed maior que 2000', async () => {
  const calls = [];
  const { service, sessions } = setup(async data => {
    calls.push(data);
    return { title: 'Título', description: 'x'.repeat(2100), fields: [] };
  });
  const id = service.create({ ...input, ...actor, outputType: 'embed' });
  let session = await service.generateSession(id, 'user');
  assert.equal(session.status, 'active');
  assert.equal(session.currentText, `Título\n${'x'.repeat(2100)}`);
  assert(service.beginRevision(id, 'user'));
  assert.equal(service.getStatus(id, 'user'), 'awaiting_correction');
  const claimed = service.claimRevision(id, 'user', 'Revisar horário');
  session = await service.generateSession(id, 'user', claimed);
  assert.equal(session, sessions.get(id, 'user'));
  assert.equal(calls[1].currentText, `Título\n${'x'.repeat(2100)}`);
  assert.equal(calls[1].additionalContext, 'Revisar horário');
  assert.equal(calls[1].originalContext, 'Ideia');
  assert.equal(session.status, 'active');
});

test('ownership e processamento bloqueiam operações concorrentes', async () => {
  let finish;
  const { service } = setup(() => new Promise(resolve => { finish = resolve; }));
  const id = service.create({ ...input, ...actor });
  assert.equal(await service.generateSession(id, 'other'), null);
  const pending = service.generateSession(id, 'user');
  assert.equal(await service.generateSession(id, 'user'), null);
  assert.equal(service.beginRevision(id, 'user'), null);
  assert.equal(service.claimForSend(id, 'user', 'channel'), null);
  finish({ content: 'Pronto' });
  await pending;
  assert.equal(service.getStatus(id, 'user'), 'active');
  assert.equal(service.beginRevision(id, 'other'), null);
});

test('falha do provider remove sessão inicial ou revisão, como no fluxo anterior', async () => {
  let fail = false;
  const failure = new Error('Falha do provider');
  const { service } = setup(async () => { if (fail) throw failure; return { content: 'Texto' }; });
  const id = service.create({ ...input, ...actor });
  await service.generateSession(id, 'user');
  service.beginRevision(id, 'user');
  const claimed = service.claimRevision(id, 'user', 'Contexto');
  fail = true;
  await assert.rejects(service.generateSession(id, 'user', claimed), error => error === failure);
  assert.equal(service.getStatus(id, 'user'), null);
  const initial = service.create({ ...input, ...actor });
  await assert.rejects(service.generateSession(initial, 'user'), error => error === failure);
  assert.equal(service.getStatus(initial, 'user'), null);
});

test('aprovação verifica canal original, permite retry e remove após envio', async () => {
  const { service } = setup();
  const id = service.create({ ...input, ...actor });
  await service.generateSession(id, 'user');
  assert.equal(service.claimForSend(id, 'other', 'channel'), null);
  assert.throws(() => service.claimForSend(id, 'user', 'other'), { code: 'TEXTA_WRONG_CHANNEL' });
  assert.equal(service.getStatus(id, 'user'), 'active');
  assert(service.claimForSend(id, 'user', 'channel'));
  service.release(id, 'user');
  assert(service.claimForSend(id, 'user', 'channel'));
  service.markSent(id, 'user');
  assert.equal(service.claimForSend(id, 'user', 'channel'), null);
});

test('geração não renova TTL ao concluir e sessão expira após 10 minutos', async t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const { service, sessions } = setup(async () => { now += 1000; return { content: 'Texto' }; });
  const id = service.create({ ...input, ...actor });
  const expires = sessions.get(id, 'user').expiresAt;
  const session = await service.generateSession(id, 'user');
  assert.equal(session.expiresAt, expires);
  now = expires;
  assert.equal(service.getStatus(id, 'user'), null);
  assert.equal(await service.generateSession(id, 'user'), null);
});
