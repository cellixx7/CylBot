require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { handleTextaAIInteraction } = require('../src/handlers/textaAIHandler');
const { TextaAIService } = require('../src/services/textaAIService');
const TextaAISessionManager = require('../src/services/textaAISessionManager');

function interaction(customId, fields = {}) {
  const result = {};
  return {
    result, customId, user: { id: 'user' }, channelId: 'channel',
    isModalSubmit: () => customId.startsWith('texta_ai:idea:') || customId.startsWith('texta_ai:correction:'),
    isButton: () => customId.startsWith('texta_ai:send:') || customId.startsWith('texta_ai:more:'),
    fields: { getTextInputValue: key => fields[key] },
    reply: async payload => { result.reply = payload; },
    deferReply: async payload => { result.deferred = payload; },
    editReply: async payload => { result.preview = payload; return { id: 'preview' }; },
    showModal: async modal => { result.modal = modal.toJSON(); },
    update: async payload => { result.update = payload; },
    followUp: async payload => { result.followUp = payload; },
    message: { components: [], edit: async payload => { result.edited = payload; } },
    channel: { send: async payload => { result.sent = payload; } },
  };
}

function setup(generate = async () => ({ content: 'Texto' })) {
  return new TextaAIService({ ai: { generate }, sessions: new TextaAISessionManager() });
}

function idea(type = 'content', characters = '100') {
  return interaction(`texta_ai:idea:${type}`, { 'texta_ai:idea': 'Ideia', 'texta_ai:characters': characters });
}
function sessionId(i) {
  return i.result.preview.components[0].toJSON().components[0].custom_id.split(':')[2];
}

test('handler mantém preview, custom IDs, revisão e envio content/embed', async () => {
  for (const type of ['content', 'embed']) {
    const calls = [];
    const output = type === 'content' ? { content: 'Texto' } : { title: 'Título', description: 'Texto', fields: [] };
    const service = setup(async input => { calls.push(input); return output; });
    const first = idea(type, '1');
    assert.equal(await handleTextaAIInteraction(first, service), true);
    assert.equal(first.result.deferred.flags, MessageFlags.Ephemeral);
    assert.equal(calls[0].targetCharacters, 1);
    const id = sessionId(first);
    const buttons = first.result.preview.components[0].toJSON().components;
    assert.equal(buttons[0].custom_id, `texta_ai:send:${id}`);
    assert.equal(buttons[1].custom_id, `texta_ai:more:${id}`);
    const more = interaction(`texta_ai:more:${id}`);
    await handleTextaAIInteraction(more, service);
    assert.equal(more.result.modal.custom_id, `texta_ai:correction:${id}`);
    const revise = interaction(`texta_ai:correction:${id}`, { 'texta_ai:additional-context': 'Incluir horário' });
    await handleTextaAIInteraction(revise, service);
    assert.equal(calls[1].additionalContext, 'Incluir horário');
    assert.equal(calls[1].currentText, type === 'content' ? 'Texto' : 'Título\nTexto');
    const send = interaction(`texta_ai:send:${id}`);
    await handleTextaAIInteraction(send, service);
    assert.deepEqual(send.result.sent.allowedMentions, { parse: [] });
    if (type === 'content') assert.equal(send.result.sent.content, 'Texto');
    else assert.equal(send.result.sent.embeds[0].toJSON().description, 'Texto');
    assert.equal(send.result.edited.content, '✅ Mensagem enviada com sucesso.');
    const duplicate = interaction(`texta_ai:send:${id}`);
    await handleTextaAIInteraction(duplicate, service);
    assert.equal(duplicate.result.reply.content, 'Esta prévia expirou ou não pertence a você.');
    assert.equal(duplicate.result.sent, undefined);
  }
});

test('handler mantém mensagens de tamanho, ownership e canal incorreto', async () => {
  const service = setup();
  const invalid = idea('content', '0');
  await handleTextaAIInteraction(invalid, service);
  assert.equal(invalid.result.reply.content, 'Informe um tamanho entre 1 e 2.000 caracteres.');
  assert.equal(invalid.result.deferred, undefined);
  const first = idea();
  await handleTextaAIInteraction(first, service);
  const id = sessionId(first);
  const otherUser = interaction(`texta_ai:more:${id}`);
  otherUser.user.id = 'other';
  await handleTextaAIInteraction(otherUser, service);
  assert.equal(otherUser.result.reply.content, 'Esta prévia expirou ou não pertence a você.');
  const otherChannel = interaction(`texta_ai:send:${id}`);
  otherChannel.channelId = 'other';
  await handleTextaAIInteraction(otherChannel, service);
  assert.equal(otherChannel.result.reply.content, 'A mensagem precisa ser aprovada no canal original.');
  assert.equal(service.getStatus(id, 'user'), 'active');
});

test('handler mantém apresentação de erros de geração e libera após falha de envio', async t => {
  t.mock.method(console, 'error', () => {});
  const failing = setup(async () => { throw new Error('O OpenRouter demorou demais para responder.'); });
  const first = idea();
  await handleTextaAIInteraction(first, failing);
  assert.equal(first.result.preview.content, 'O OpenRouter demorou demais para responder.');
  assert.deepEqual(first.result.preview.components, []);
  const service = setup();
  const ready = idea();
  await handleTextaAIInteraction(ready, service);
  const id = sessionId(ready);
  const send = interaction(`texta_ai:send:${id}`);
  send.channel.send = async () => { throw new Error('Sem permissão'); };
  await handleTextaAIInteraction(send, service);
  assert.equal(send.result.followUp.content, 'Não foi possível publicar a mensagem neste canal.');
  assert.equal(service.getStatus(id, 'user'), 'active');
  const retry = interaction(`texta_ai:send:${id}`);
  await handleTextaAIInteraction(retry, service);
  assert.equal(retry.result.sent.content, 'Texto');
  assert.equal(service.getStatus(id, 'user'), null);
});

test('handler ignora interações alheias sem chamar service', async () => {
  const unused = new Proxy({}, { get: () => assert.fail('Não deve acessar service') });
  for (const customId of ['ann:send:123', 'other:idea', 'texta_ai:unknown:123']) {
    assert.equal(await handleTextaAIInteraction({ customId, isModalSubmit: () => true, isButton: () => false }, unused), false);
    assert.equal(await handleTextaAIInteraction({ customId, isModalSubmit: () => false, isButton: () => true }, unused), false);
  }
});
