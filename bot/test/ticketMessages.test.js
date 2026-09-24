require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ticketAIFixture, ids } = require('./helpers/ticketAIFixture');
const { TicketMessageHandler } = require('../src/Ticket/handlers/ticketMessageHandler');
const { TicketAIContextService } = require('../src/Ticket/services/ticketAIContextService');
const { TicketTranscriptService } = require('../src/Ticket/services/ticketTranscriptService');

const discordInput = f => ({ guildId: ids.guild, channelId: f.ticket.channelId, messageId: '100000000000000099',
  userId: ids.user, content: 'Mensagem Discord', createdAt: new Date() });

test('Discord inbound persiste antes dos consumidores e o mesmo evento não duplica', async t => {
  const f = await ticketAIFixture(t); f.messages.length = 0;
  const seen = [];
  const handler = new TicketMessageHandler({ messages: f.messageService, ai: { enqueue(value) {
    assert.equal(f.messages.length, 1); seen.push(value);
  } } });
  await handler.handle(discordInput(f));
  await handler.handle(discordInput(f));
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].origin, 'DISCORD');
  assert.equal(f.messages[0].deliveryStatus, 'SENT');
  assert.equal(seen.length, 1);
});

test('sync legado é explícito, idempotente e importa histórico ativo como DISCORD', async t => {
  const f = await ticketAIFixture(t); f.messages.length = 0;
  f.messageRepository.hasLegacySyncBoundary = async ticketId => f.messages.some(message =>
    message.ticketId === ticketId && ['DISCORD', 'WEB'].includes(message.origin));
  f.core.adapter.fetchMessages = async () => [
    { id: '100000000000000003', authorId: ids.staff, authorName: 'Staff', authorBot: false,
      createdAt: '2026-01-03T00:00:00.000Z', content: 'Terceira', embeds: [] },
    { id: '100000000000000001', authorId: ids.user, authorName: 'Criador', authorBot: false,
      createdAt: '2026-01-01T00:00:00.000Z', content: 'Primeira', embeds: [] },
    { id: '100000000000000002', authorId: ids.user, authorName: 'Criador', authorBot: false,
      createdAt: '2026-01-02T00:00:00.000Z', content: 'Segunda', embeds: [] },
  ];
  const first = await f.messageService.syncDiscordHistory(f.ticket);
  const retry = await f.messageService.syncDiscordHistory(f.ticket);
  assert.equal(first.imported, 3);
  assert.equal(retry.skipped, true);
  assert.equal(f.messages.length, 3);
  assert.deepEqual(f.messages.map(message => message.discordMessageId),
    ['100000000000000001', '100000000000000002', '100000000000000003']);
  assert(f.messages.every(message => message.origin === 'DISCORD'));
});

test('sync legado não é pulado por linha AI e primeira mensagem concorrente não duplica histórico', async t => {
  const f = await ticketAIFixture(t); f.messages.length = 0;
  f.messageRepository.hasLegacySyncBoundary = async ticketId => f.messages.some(message =>
    message.ticketId === ticketId && ['DISCORD', 'WEB'].includes(message.origin));
  await f.messageRepository.create({ id: randomUUID(), ticketId: f.ticket.id, guildId: ids.guild, authorName: 'IA',
    authorType: 'AI', origin: 'AI', visibility: 'INTERNAL', content: 'Sugestão anterior', deliveryStatus: 'SENT' });
  const currentA = { ...discordInput(f), messageId: '100000000000000091', content: 'Nova A', createdAt: new Date('2026-01-03T00:00:00Z') };
  const currentB = { ...discordInput(f), messageId: '100000000000000092', content: 'Nova B', createdAt: new Date('2026-01-04T00:00:00Z') };
  f.core.adapter.fetchMessages = async () => [
    { id: currentB.messageId, authorId: ids.user, authorName: 'Criador', authorBot: false,
      createdAt: currentB.createdAt.toISOString(), content: currentB.content, embeds: [] },
    { id: currentA.messageId, authorId: ids.user, authorName: 'Criador', authorBot: false,
      createdAt: currentA.createdAt.toISOString(), content: currentA.content, embeds: [] },
    { id: '100000000000000090', authorId: ids.user, authorName: 'Criador', authorBot: false,
      createdAt: '2026-01-02T00:00:00.000Z', content: 'Legada', embeds: [] },
  ];
  await Promise.all([f.messageService.ingestDiscordMessage(currentA), f.messageService.ingestDiscordMessage(currentB)]);
  const discordIds = f.messages.filter(message => message.origin === 'DISCORD').map(message => message.discordMessageId);
  assert.equal(discordIds.length, 3);
  assert.equal(new Set(discordIds).size, 3);
  assert.deepEqual([...discordIds].sort(), ['100000000000000090', currentA.messageId, currentB.messageId]);
});

test('mensagem Web persiste PENDING, conclui SENT e clientMessageId é idempotente', async t => {
  const f = await ticketAIFixture(t); f.messages.length = 0;
  let observedPending = false;
  f.core.adapter.publishTicketMessage = async (ticket, message) => {
    observedPending = message.deliveryStatus === 'SENDING' && f.messages.some(item => item.id === message.id);
    return { id: '100000000000000100', channelId: ticket.channelId };
  };
  const input = { guildId: ids.guild, ticketId: f.ticket.id, userId: ids.user, clientMessageId: 'web-message-0001', content: 'Mensagem Web' };
  const first = await f.messageService.createWebMessage(input);
  const retry = await f.messageService.createWebMessage(input);
  assert.equal(observedPending, true);
  assert.equal(first.deliveryStatus, 'SENT');
  assert.equal(retry.id, first.id);
  assert.equal(f.messages.length, 1);
});

test('falha de entrega preserva mensagem FAILED e retry usa a mesma identidade', async t => {
  const f = await ticketAIFixture(t); f.messages.length = 0;
  let fail = true;
  f.core.adapter.publishTicketMessage = async ticket => {
    if (fail) throw Object.assign(new Error('Discord indisponível'), { code: 'DISCORD_DOWN' });
    return { id: '100000000000000101', channelId: ticket.channelId };
  };
  const failed = await f.messageService.createWebMessage({ guildId: ids.guild, ticketId: f.ticket.id, userId: ids.user,
    clientMessageId: 'web-message-0002', content: 'Persistir mesmo com falha' });
  assert.equal(failed.deliveryStatus, 'FAILED');
  fail = false;
  const delivered = await f.messageService.retryDelivery({
  guildId: ids.guild,
  ticketId: f.ticket.id,
  messageId: failed.id,
  userId: ids.user,
});
  assert.equal(delivered.id, failed.id);
  assert.equal(delivered.deliveryStatus, 'SENT');
  assert.equal(delivered.deliveryAttempts, 2);
  assert.equal(f.messages.length, 1);
});

test('edição Web chama Discord antes da revisão persistida e não cria revisão para conteúdo idêntico', async t => {
  const f = await ticketAIFixture(t); f.messages.length = 0;
  const created = await f.messageRepository.create({ id: randomUUID(), ticketId: f.ticket.id, guildId: ids.guild,
    authorDiscordId: ids.user, authorName: 'Criador', authorType: 'USER', origin: 'WEB', visibility: 'PUBLIC',
    content: 'Antes', discordMessageId: '100000000000000110', discordChannelId: f.ticket.channelId, deliveryStatus: 'SENT' });
  const order = []; const revisions = [];
  f.core.adapter.editTicketMessage = async (ticket, message, content) => {
    order.push('discord');
    assert.equal(ticket.id, f.ticket.id); assert.equal(message.id, created.message.id); assert.equal(content, 'Depois');
  };
  f.messageRepository.editContent = async input => {
    order.push('repository'); revisions.push({ messageId: input.messageId, previousContent: created.message.content, editorDiscordId: input.editorDiscordId });
    Object.assign(created.message, { content: input.content, editedAt: Date.now(), updatedAt: Date.now() });
    return created.message;
  };
  const updated = await f.messageService.editWebMessage({ guildId: ids.guild, ticketId: f.ticket.id, messageId: created.message.id,
    userId: ids.user, content: 'Depois' });
  assert.equal(updated.content, 'Depois');
  assert.deepEqual(order, ['discord', 'repository']);
  assert.deepEqual(revisions, [{ messageId: created.message.id, previousContent: 'Antes', editorDiscordId: ids.user }]);
  order.length = 0;
  await f.messageService.editWebMessage({ guildId: ids.guild, ticketId: f.ticket.id, messageId: created.message.id,
    userId: ids.user, content: 'Depois' });
  assert.deepEqual(order, []);
});

test('revision history requires VIEW, checks its ticket, and omits the editor', async t => {
  const f = await ticketAIFixture(t);
  const message = f.messages[0];
  f.messageRepository.listRevisions = async id => {
    assert.equal(id, message.id);
    return [{ id: randomUUID(), messageId: id, editorDiscordId: ids.staff, previousContent: 'Previous content', createdAt: 10 }];
  };
  const revisions = await f.messageService.listRevisions({ guildId: ids.guild, ticketId: f.ticket.id, messageId: message.id, userId: ids.user });
  assert.deepEqual(revisions, [{ id: revisions[0].id, previousContent: 'Previous content', createdAt: 10 }]);
  await assert.rejects(f.messageService.listRevisions({ guildId: ids.guild, ticketId: f.ticket.id, messageId: randomUUID(), userId: ids.user }), { statusCode: 404 });
});

test('duas tentativas concorrentes reservam uma única entrega Discord', async t => {
  const f = await ticketAIFixture(t); f.messages.length = 0;
  const reserved = await f.messageRepository.create({ id: randomUUID(), ticketId: f.ticket.id, guildId: ids.guild,
    authorDiscordId: ids.user, authorName: 'Criador', authorType: 'USER', origin: 'WEB', visibility: 'PUBLIC',
    content: 'Entrega única', deliveryStatus: 'PENDING' });
  let calls = 0;
  f.core.adapter.publishTicketMessage = async ticket => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return { id: '100000000000000103', channelId: ticket.channelId };
  };
  await Promise.all([f.messageService.deliver(f.ticket, reserved.message), f.messageService.deliver(f.ticket, reserved.message)]);
  assert.equal(calls, 1);
  assert.equal(f.messages[0].deliveryStatus, 'SENT');
});

test('SENDING abandonado é retomado e conclusão antiga não sobrescreve tentativa nova', async t => {
  const f = await ticketAIFixture(t); f.messages.length = 0;
  const reserved = await f.messageRepository.create({ id: randomUUID(), ticketId: f.ticket.id, guildId: ids.guild,
    authorDiscordId: ids.user, authorName: 'Criador', authorType: 'USER', origin: 'WEB', visibility: 'PUBLIC',
    content: 'Recovery', deliveryStatus: 'SENDING', deliveryAttempts: 1, updatedAt: Date.now() - 61000 });
  const newer = await f.messageRepository.startDelivery(ids.guild, reserved.message.id);
  assert.equal(newer.deliveryAttempts, 2);
  const sent = await f.messageRepository.markDelivered(ids.guild, reserved.message.id, newer.deliveryAttempts,
    { discordMessageId: '100000000000000104', discordChannelId: f.ticket.channelId });
  assert.equal(sent.deliveryStatus, 'SENT');
  assert.equal(await f.messageRepository.markFailed(ids.guild, reserved.message.id, 1, 'OLD_FAILURE'), null);
  assert.equal((await f.messageRepository.findById(ids.guild, reserved.message.id)).deliveryStatus, 'SENT');
});

test('VIEW/RESPOND permitem criador e support role; visibility INTERNAL fica restrita à equipe', async t => {
  const f = await ticketAIFixture(t); f.messages.length = 0;
  await f.messageService.createWebMessage({ guildId: ids.guild, ticketId: f.ticket.id, userId: ids.user,
    clientMessageId: 'web-message-0003', content: 'Pública' });
  await f.messageRepository.create({ id: randomUUID(), ticketId: f.ticket.id, guildId: ids.guild, authorName: 'IA',
    authorType: 'AI', origin: 'AI', visibility: 'INTERNAL', content: 'Nota interna', deliveryStatus: 'SENT' });
  const creator = await f.messageService.list({ guildId: ids.guild, ticketId: f.ticket.id, userId: ids.user });
  const staff = await f.messageService.list({ guildId: ids.guild, ticketId: f.ticket.id, userId: ids.staff });
  assert.deepEqual(creator.messages.map(message => message.content), ['Pública']);
  assert.deepEqual(staff.messages.map(message => message.content), ['Pública', 'Nota interna']);
  const outsider = '666666666666666666';
  f.core.actors.set(outsider, { id: outsider, name: 'Outro', bot: false, roleIds: [], permissions: '0' });
  await assert.rejects(f.messageService.list({ guildId: ids.guild, ticketId: f.ticket.id, userId: outsider }), { statusCode: 403 });
  await assert.rejects(f.messageService.createWebMessage({ guildId: ids.guild, ticketId: f.ticket.id, userId: outsider,
    clientMessageId: 'web-message-0004', content: 'Negada' }), { statusCode: 403 });
});

test('contexto da IA lê DISCORD, WEB e AI do armazenamento canônico em ordem', async t => {
  const f = await ticketAIFixture(t); f.messages.length = 0;
  await f.messageService.ingestDiscordMessage(discordInput(f));
  await f.messageService.createWebMessage({ guildId: ids.guild, ticketId: f.ticket.id, userId: ids.staff,
    clientMessageId: 'web-message-0005', content: 'Mensagem staff Web' });
  const ai = await f.messageService.reserveAIMessage({ ticket: f.ticket, config: { assistantName: 'CylBot' }, runId: randomUUID(),
    proposal: { message: 'Mensagem AI' } });
  await f.messageService.deliver(f.ticket, ai);
  const context = await new TicketAIContextService(f.messageService).build(f.ticket, { assistantName: 'CylBot', tone: 'cordial',
    language: 'pt-BR', serverContext: '', supportInstructions: '' });
  const conversation = JSON.parse(context[1].content).CONVERSATION;
  assert.deepEqual(conversation.map(item => item.source), ['USER', 'STAFF', 'AI']);
  assert.deepEqual(conversation.map(item => item.text), ['Mensagem Discord', 'Mensagem staff Web', 'Mensagem AI']);
});

test('entrega Discord lenta ocorre depois do encerramento do lock de policy da IA', async t => {
  const f = await ticketAIFixture(t);
  let inLock = false; let deliveryObserved = false;
  const locked = f.repository.locked.bind(f.repository);
  f.repository.locked = (guildId, ticketId, operation) => locked(guildId, ticketId, async context => {
    inLock = true;
    try { return await operation(context); } finally { inLock = false; }
  });
  const getActor = f.core.adapter.getActor.bind(f.core.adapter);
  f.core.adapter.getActor = (...args) => { assert.equal(inLock, false); return getActor(...args); };
  const generateTicket = f.provider.generateTicket.bind(f.provider);
  f.provider.generateTicket = input => { assert.equal(inLock, false); return generateTicket(input); };
  f.core.adapter.publishTicketMessage = async ticket => {
    assert.equal(inLock, false);
    deliveryObserved = true;
    await new Promise(resolve => setTimeout(resolve, 10));
    return { id: '100000000000000102', channelId: ticket.channelId };
  };
  await f.send();
  assert.equal(deliveryObserved, true);
});

test('transcript novo usa conversa canônica multicanal, exclui INTERNAL e legado mantém fallback Discord', async t => {
  const f = await ticketAIFixture(t); f.messages.length = 0;
  for (const [content, origin, authorType, visibility = 'PUBLIC'] of [
    ['Do Discord', 'DISCORD', 'USER'], ['Da Web', 'WEB', 'STAFF'], ['Da IA', 'AI', 'AI'], ['Interna', 'AI', 'AI', 'INTERNAL'],
  ]) await f.messageRepository.create({ id: randomUUID(), ticketId: f.ticket.id, guildId: ids.guild, authorName: authorType,
    authorType, origin, visibility, content, deliveryStatus: 'SENT' });
  const ticket = { ...f.ticket, closing: { startedAt: Date.now(), reason: 'Teste', summary: '' } };
  const transcripts = new TicketTranscriptService({ adapter: f.core.adapter, repository: f.core.transcriptRepository, messages: f.messageService });
  const reference = await transcripts.generate(ticket);
  const html = transcripts.read(reference).toString();
  assert.equal(reference.source, 'MESSAGE_CORE');
  assert.match(html, /Do Discord/); assert.match(html, /Da Web/); assert.match(html, /Da IA/); assert.doesNotMatch(html, /Interna/);

  f.messages.length = 0;
  const legacy = await transcripts.generate(ticket);
  assert.equal(legacy.source, 'DISCORD_LEGACY');
  assert.match(transcripts.read(legacy).toString(), /Fallback legado/);
});
