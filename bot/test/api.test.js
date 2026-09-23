require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { tempDirectory } = require('./helpers/tempDirectory');
const path = require('node:path');
const { createRequestHandler } = require('../src/api/server');
const { clientError } = require('../src/api/http/errors');
const { AnnouncementService } = require('../src/services/announcementService');
const { JsonAnnouncementRepository } = require('../src/repositories/jsonAnnouncementRepository');
const OpenRouterService = require('../src/services/openRouterService');
const { loadEnv } = require('../src/config/env');
const { TextaAIService } = require('../src/services/textaAIService');
const { logger } = require('../src/lib/logger');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { DashboardService } = require('../src/services/dashboardService');

// Exercita o mesmo callback usado por node:http, sem abrir portas nem acessar serviços externos.
async function request(context, method, url, body, raw) {
  const incoming = Readable.from([raw ?? JSON.stringify(body ?? {})]);
  // Fixtures autenticadas preservam os testes de contrato; abuso anônimo fica em security.test.js.
  const auth = { config: loadEnv({}, { requireDiscord: false }).auth, sessions: new AuthSessionManager() };
  const session = auth.sessions.create({ id: 'api-user' }, { access_token: 'fake', scope: 'identify guilds', expires_in: 3600 });
  const client = { isReady: () => true, user: { id: 'bot' }, guilds: { cache: new Map([[guildId, { id: guildId, name: 'Servidor' }]]) }, ...context.client };
  const dashboard = new DashboardService({ client, provider: { getCurrentUserGuilds: async () => [{ id: guildId, name: 'Servidor', owner: true, icon: null }] } });
  context = { ...context, client, services: { auth, dashboard, ...context.services } };
  Object.assign(incoming, { method, url, headers: { origin: auth.config.webOrigin, cookie: `cylbot_session=${session.id}` } });
  const response = {
    headers: {}, ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); return this; },
    end(text) { assert.equal(this.ended, false); this.ended = true; this.body = text ? JSON.parse(text) : undefined; },
  };
  await createRequestHandler(context)(incoming, response);
  assert.equal(response.ended, true);
  return response;
}

function silenceExpectedErrors(t) {
  return {
    error: t.mock.method(logger, 'error', () => {}),
    warn: t.mock.method(logger, 'warn', () => {}),
  };
}

const input = { outputType: 'content', idea: ' Ideia ', targetCharacters: 100 };
const guildId = '12345678901234567';
const channelId = '23456789012345678';

test('health, CORS, OPTIONS e fallback mantêm os contratos', async () => {
  const health = await request({}, 'GET', '/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { ok: true });
  assert.equal(health.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(health.headers['Access-Control-Allow-Origin'], 'http://localhost:5173');
  assert.equal(health.headers['Access-Control-Allow-Methods'], 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  assert.equal(health.headers['Access-Control-Allow-Headers'], 'Content-Type');
  const missing = await request({}, 'GET', '/api/missing');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'Rota não encontrada.' });
  const options = await request({}, 'OPTIONS', '/api/ai/generate');
  assert.equal(options.status, 204);
  assert.equal(options.body, undefined);
});

test('métodos incorretos não executam operações nem acessam dependências', async () => {
  for (const [method, url] of [
    ['POST', '/api/health'], ['GET', '/api/ai/generate'], ['GET', '/api/discord/send'],
    ...['categories', 'save', 'generate', 'send'].map(action => ['GET', `/api/announcements/${action}`]),
  ]) {
    // Contexto vazio: acessar qualquer integração seria um erro 500.
    const response = await request({}, method, url);
    assert.equal(response.status, 404, `${method} ${url}`);
  }
});

test('AI encaminha dados normalizados e preserva resposta', async () => {
  const generated = { content: 'Texto gerado' };
  let received;
  const services = { textaAI: new TextaAIService({ ai: { generate: async data => { received = data; return generated; } } }) };
  const response = await request({ services }, 'POST', '/api/ai/generate', input);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { generated });
  assert.deepEqual(received, { outputType: 'content', idea: 'Ideia', originalContext: 'Ideia', additionalContext: '', currentText: '', targetCharacters: 100 });
});

test('validações AI, JSON inválido e limite do body preservam erros', async t => {
  silenceExpectedErrors(t);
  const context = { services: { textaAI: new TextaAIService({ ai: { generate: () => assert.fail('Entrada inválida não deve chamar provider') } }) } };
  for (const [body, message] of [
    [{ ...input, outputType: 'outro' }, 'Escolha Content ou Embed.'],
    [{ ...input, idea: '' }, 'A ideia deve ter entre 1 e 2.000 caracteres.'],
    [{ ...input, currentText: 'x'.repeat(2001) }, 'Os textos informados não podem ultrapassar 2.000 caracteres.'],
    [{ ...input, targetCharacters: 19 }, 'O tamanho deve ser um número entre 20 e 2.000 caracteres.'],
  ]) {
    const response = await request(context, 'POST', '/api/ai/generate', body);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: message });
  }
  const invalid = await request({}, 'POST', '/api/ai/generate', null, '{');
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body, { error: 'JSON inválido.' });
  const oversized = await request({}, 'POST', '/api/ai/generate', null, JSON.stringify({ idea: 'x'.repeat(20001) }));
  assert.equal(oversized.status, 413);
  assert.deepEqual(oversized.body, { error: 'Requisição muito grande.' });
});

test('tratamento central preserva erro controlado e oculta erro inesperado', async t => {
  const log = silenceExpectedErrors(t);
  for (const [error, status, message] of [
    [clientError(403, 'Operação não autorizada.'), 403, 'Operação não autorizada.'],
    [new Error('Detalhe interno secreto'), 500, 'Não foi possível concluir a operação.'],
  ]) {
    const services = { textaAI: new TextaAIService({ ai: { generate: async () => { throw error; } } }) };
    const response = await request({ services }, 'POST', '/api/ai/generate', input);
    assert.equal(response.status, status);
    assert.deepEqual(response.body, { error: message });
  }
  assert.equal(log.error.mock.callCount(), 1);
  assert.equal(log.warn.mock.callCount(), 1);
  for (const method of [log.error, log.warn]) {
    const [event, context] = method.mock.calls[0].arguments;
    assert.equal(event, 'api.request_failed');
    assert.equal(context.method, 'POST');
    assert.equal(context.path, '/api/ai/generate');
    assert.match(context.requestId, /^[0-9a-f-]{36}$/);
  }
});

test('Discord mantém envios content/embed e allowedMentions', async () => {
  const payloads = [];
  const client = { channels: { fetch: async id => {
    assert.equal(id, channelId);
    return { guildId, permissionsFor: () => ({ has: () => true }), isTextBased: () => true, send: async payload => { payloads.push(payload); } };
  } } };
  const services = { openRouter: new OpenRouterService(loadEnv({}, { requireDiscord: false }).openRouter) };
  for (const [outputType, generated] of [
    ['content', { content: 'Mensagem' }],
    ['embed', { title: 'Título', description: 'Descrição', fields: [{ name: 'Campo', value: 'Valor' }] }],
  ]) {
    const response = await request({ client, services }, 'POST', '/api/discord/send', { channelId, outputType, generated });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true });
    assert.deepEqual(payloads.at(-1).allowedMentions, { parse: [] });
  }
  assert.equal(payloads[0].content, 'Mensagem');
  const embed = payloads[1].embeds[0].toJSON();
  assert.equal(embed.title, 'Título');
  assert.equal(embed.description, 'Descrição');
  assert.equal(embed.color, 0x5865f2);
  assert.equal(embed.fields[0].value, 'Valor');
});

test('Discord rejeita ID, conteúdo e canal inválidos antes de publicar', async t => {
  silenceExpectedErrors(t);
  const services = { openRouter: new OpenRouterService(loadEnv({}, { requireDiscord: false }).openRouter) };
  const valid = { channelId, outputType: 'content', generated: { content: 'Texto' } };
  for (const [body, message] of [
    [{ ...valid, channelId: 'bad' }, 'Informe um Channel ID Discord válido.'],
    [{ ...valid, outputType: 'bad' }, 'Tipo de mensagem inválido.'],
    [{ ...valid, generated: null }, 'A mensagem gerada é obrigatória.'],
  ]) {
    const response = await request({ services }, 'POST', '/api/discord/send', body);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: message });
  }
  const malformed = await request({ services }, 'POST', '/api/discord/send', { ...valid, generated: {} });
  assert.equal(malformed.status, 400);
  assert.match(malformed.body.error, /^Mensagem gerada inválida:/);
  for (const channel of [null, { isTextBased: () => false }]) {
    const client = { channels: { fetch: async () => channel } };
    const response = await request({ client, services }, 'POST', '/api/discord/send', valid);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: 'O Channel ID não pertence a um canal de texto enviável.' });
  }
});

test('anúncios mantêm categorias, sessão autenticada, persistência, revisão e envio', async t => {
  silenceExpectedErrors(t);
  const dir = tempDirectory(t, 'api-announcements-');
  const calls = [];
  const announcements = new AnnouncementService(new JsonAnnouncementRepository(path.join(dir, 'data.json')), { generate: async data => { calls.push(data); return { content: 'Anúncio' }; } });
  const sent = [];
  const channel = { id: channelId, guildId, permissionsFor: () => ({ has: () => true }), isTextBased: () => true, send: async payload => { sent.push(payload); } };
  const guild = { id: guildId, name: 'Servidor' };
  const context = { services: { announcements }, client: { guilds: { cache: new Map([[guildId, guild]]) }, channels: { fetch: async () => channel } } };
  const call = (action, body = {}) => request(context, 'POST', `/api/announcements/${action}`, { guildId, ...body });
  const categories = await call('categories');
  assert.equal(categories.status, 200);
  assert.equal(categories.body.guildName, 'Servidor');
  assert.equal(categories.body.categories.length, 4);
  const saved = await call('save', { category: { name: 'Nova', title: 'Título' }, owner: 'forjado', authorization: { permissions: 'forjadas' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.categories.length, 5);
  assert.equal(new AnnouncementService(new JsonAnnouncementRepository(path.join(dir, 'data.json'))).categories(guildId).length, 5);
  const generated = await call('generate', { categoryId: 'default-0', description: 'Ideia', owner: 'forjado' });
  assert.equal(generated.status, 200);
  assert.deepEqual(Object.keys(generated.body).sort(), ['draftId', 'embed']);
  assert.equal(announcements.get(generated.body.draftId, 'web:api-user', guildId).owner, 'web:api-user');
  const revised = await call('generate', { draftId: generated.body.draftId, context: 'Mais contexto' });
  assert.equal(revised.status, 200);
  assert.equal(calls[1].additionalContext, 'Mais contexto');
  assert.equal(calls[1].currentText, 'Anúncio');
  const stale = await call('send', { draftId: generated.body.draftId, channelId });
  assert.equal(stale.status, 400);
  channel.guildId = 'outro';
  const wrongGuild = await call('send', { draftId: revised.body.draftId, channelId });
  assert.equal(wrongGuild.status, 403);
  assert.equal(sent.length, 0);
  channel.guildId = guildId;
  const delivered = await call('send', { draftId: revised.body.draftId, channelId });
  assert.equal(delivered.status, 200);
  assert.deepEqual(delivered.body, { ok: true });
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
  const duplicate = await call('send', { draftId: revised.body.draftId, channelId });
  assert.equal(duplicate.status, 400);
  assert.equal(sent.length, 1);
});

test('anúncios mantêm validação de guild, canal e subrota desconhecida', async t => {
  silenceExpectedErrors(t);
  const guild = { id: guildId, name: 'Servidor' };
  const context = { client: { guilds: { cache: new Map([[guildId, guild]]) }, channels: { fetch: async () => null } }, services: {} };
  for (const [action, body, status, message] of [
    ['categories', { guildId: 'inválido' }, 400, 'Informe um ID de servidor válido.'],
    ['categories', { guildId: '99999999999999999' }, 403, 'FORBIDDEN'],
    ['send', { guildId, channelId: 'inválido' }, 400, 'Informe um ID de canal válido.'],
    ['send', { guildId, channelId }, 400, 'Canal não encontrado.'],
    ['unknown', { guildId }, 404, 'Rota não encontrada.'],
    // Mantém a ordem legada: validação de guild antes do fallback de subrota.
    ['unknown', {}, 400, 'Informe um ID de servidor válido.'],
  ]) {
    const response = await request(context, 'POST', `/api/announcements/${action}`, body);
    assert.equal(response.status, status);
    assert.deepEqual(response.body, { error: message });
  }
});

test('Web e Discord usam TextaAIService e encaminham a mesma operação ao provider', async () => {
  const { handleTextaAIInteraction } = require('../src/handlers/textaAIHandler');
  const TextaAISessionManager = require('../src/services/textaAISessionManager');
  const calls = [];
  const service = new TextaAIService({
    ai: { generate: async data => { calls.push(data); return { content: 'Resultado' }; } },
    sessions: new TextaAISessionManager(),
  });
  const response = await request({ services: { textaAI: service } }, 'POST', '/api/ai/generate', input);
  let preview;
  await handleTextaAIInteraction({
    customId: 'texta_ai:idea:content', isModalSubmit: () => true,
    user: { id: 'user' }, channelId: 'channel',
    fields: { getTextInputValue: key => key === 'texta_ai:idea' ? 'Ideia' : '100' },
    deferReply: async () => {}, editReply: async payload => { preview = payload; },
  }, service);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(response.body, { generated: { content: 'Resultado' } });
  assert.equal(preview.content, 'Prévia privada:\n\nResultado');
});

test('API preserva revisão, mínimo 20 e limitações HTTP sem aceitar opções do body', async t => {
  silenceExpectedErrors(t);
  const calls = [];
  const service = new TextaAIService({ ai: { generate: async data => { calls.push(data); return { title: 'Título', description: 'Revisão', fields: [] }; } } });
  const context = { services: { textaAI: service } };
  const response = await request(context, 'POST', '/api/ai/generate', {
    ...input, outputType: 'embed', currentText: ' Texto anterior ', additionalContext: ' Contexto ', originalContext: ' Original ', targetCharacters: '20',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { generated: { title: 'Título', description: 'Revisão', fields: [] } });
  assert.deepEqual(calls[0], { outputType: 'embed', idea: 'Ideia', currentText: 'Texto anterior', additionalContext: 'Contexto', originalContext: 'Original', targetCharacters: 20 });
  for (const body of [
    { ...input, targetCharacters: 1, minTargetCharacters: 1 },
    { ...input, currentText: 'x'.repeat(2001), maxContextLength: 10000 },
    { ...input, originalContext: 'x'.repeat(2001) },
    { ...input, idea: '   ', trimText: false },
    null,
  ]) {
    const denied = await request(context, 'POST', '/api/ai/generate', body, body === null ? 'null' : undefined);
    assert.equal(denied.status, 400);
  }
  assert.equal(calls.length, 1);
});

test('API não anuncia sucesso nem expõe detalhes ao falhar persistência de anúncios', async t => {
  silenceExpectedErrors(t);
  const announcements = new AnnouncementService({
    getCategories: () => undefined,
    saveCategories: () => { throw new Error('private-storage-path'); },
  });
  const context = {
    services: { announcements },
    client: { guilds: { cache: new Map([[guildId, { id: guildId, name: 'Servidor' }]]) } },
  };
  const response = await request(context, 'POST', '/api/announcements/save', { guildId, category: { name: 'Nova', title: 'Título' } });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: 'Não foi possível concluir a operação.' });
});

test('requestId é exclusivo, chega à rota e corresponde ao header e log de erro', async t => {
  const route = require('../src/api/routes/healthRoutes');
  const seen = [];
  t.mock.method(route, 'handle', async (req, res, context) => {
    seen.push(context.requestId);
    throw clientError(400, 'Entrada inválida.');
  });
  const logs = silenceExpectedErrors(t);
  const context = { client: {} };
  const first = await request(context, 'GET', '/api/health?token=private-query');
  const second = await request(context, 'GET', '/api/health');
  assert.notEqual(first.headers['X-Request-Id'], second.headers['X-Request-Id']);
  assert.deepEqual(seen, [first.headers['X-Request-Id'], second.headers['X-Request-Id']]);
  assert.equal(context.requestId, undefined);
  const [event, fields] = logs.warn.mock.calls[0].arguments;
  assert.equal(event, 'api.request_failed');
  assert.equal(fields.requestId, first.headers['X-Request-Id']);
  assert.equal(fields.path, '/api/health');
  assert.equal(fields.statusCode, 400);
  assert.deepEqual(first.body, { error: 'Entrada inválida.' });
});
