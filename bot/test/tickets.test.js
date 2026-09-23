require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ticketFixture, ids } = require('./helpers/ticketFixture');
const { TICKET_STATUS: S, TICKET_EVENT: E } = require('../src/services/ticketConstants');

test('abertura persiste identidade independente, sequência, canal e evento; JSON sobrevive a nova instância', async t => {
  const f = ticketFixture(t);
  const ticket = await f.create();
  assert.notEqual(ticket.id, ticket.channelId);
  assert.equal(ticket.sequence, 1);
  assert.equal(ticket.status, S.OPEN);
  assert.equal(ticket.events[0].type, E.CREATED);
  assert.equal(f.makeService().ticket(ids.guild, ticket.id).channelId, ticket.channelId);
  f.advance();
  assert.equal((await f.create({ categoryId: 'report' })).sequence, 2);
  assert.deepEqual(f.calls.filter(call => ['createChannel','initial','openedLog'].includes(call)), ['createChannel','initial','openedLog','createChannel','initial','openedLog']);
});

test('abertura rejeita config ausente, bot, categoria inválida, campos e painel falsos sem criar canal', async t => {
  const f = ticketFixture(t, { configured: false });
  await assert.rejects(f.create(), /não configurado/);
  assert.equal(f.channels.size, 0);
  const configured = ticketFixture(t);
  for (const input of [{ categoryId: 'missing' }, { channelId: ids.log }, { subject: '' }, { description: 'x'.repeat(2001) }, { guildId: ids.otherGuild }]) await assert.rejects(configured.create(input));
  configured.actors.get(ids.user).bot = true;
  await assert.rejects(configured.create(), { statusCode: 403 });
  assert.equal(configured.channels.size, 0);
});

test('limites e cooldown persistem; criação concorrente só reserva um ticket', async t => {
  const f = ticketFixture(t);
  const results = await Promise.allSettled([f.create(), f.create()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  await assert.rejects(f.create(), /ativo nesta categoria/);
  await assert.rejects(f.create({ categoryId: 'report' }), /60 segundos/);
  await assert.rejects(f.makeService().create({ ...f.input, categoryId: 'report' }), /60 segundos/);
  f.advance(); await f.create({ categoryId: 'report' });
  f.advance(); await f.create({ categoryId: 'billing' });
  f.advance(); await assert.rejects(f.create({ categoryId: 'other' }), /três tickets/);
});

test('abertura interrompida retoma o mesmo ticket e canal sem criar outra identidade', async t => {
  const f = ticketFixture(t);
  const original = f.adapter.publishInitial;
  f.adapter.publishInitial = async () => { throw new Error('Falha Discord'); };
  await assert.rejects(f.create());
  const pending = f.repository.list(ids.guild)[0];
  assert(pending.channelId);
  f.adapter.publishInitial = original;
  const ticket = await f.makeService().create(f.input);
  assert.equal(ticket.id, pending.id);
  assert.equal(ticket.sequence, 1);
  assert.equal(f.channels.size, 1);
});

test('claim revalida staff, rejeita owner comum, segunda atribuição, outra guild e canal', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  await assert.rejects(f.service.claim({ ...f.action(ticket), userId: ids.user }), { statusCode: 403 });
  await assert.rejects(f.service.claim({ ...f.action(ticket), guildId: ids.otherGuild }), { statusCode: 404 });
  await assert.rejects(f.service.claim({ ...f.action(ticket), channelId: ids.log }), { statusCode: 403 });
  const results = await Promise.allSettled([f.service.claim(f.action(ticket)), f.service.claim({ ...f.action(ticket), userId: ids.admin })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const claimed = f.repository.get(ids.guild, ticket.id);
  assert.equal(claimed.status, S.CLAIMED);
  assert.equal(claimed.assignedUserId, ids.staff);
  assert.equal(claimed.claimedAt, f.now());
  await assert.rejects(f.service.claim(f.action(ticket)), /já está sendo atendido/);
});

test('fechamento salva transcript e motivo, publica log, bloqueia e só permite exclusão explícita depois', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  const publish = f.adapter.publishClosed;
  f.adapter.publishClosed = async (current, data) => {
    const saved = f.repository.get(ids.guild, ticket.id);
    assert(saved.closing.transcript.key);
    assert.equal(saved.closing.reason, 'Resolvido');
    return publish(current, data);
  };
  const closed = await f.close(ticket);
  assert.equal(closed.status, S.CLOSED);
  assert.equal(closed.closing.completed, true);
  assert(f.channels.has(ticket.channelId));
  assert.equal(f.channels.get(ticket.channelId).locked, true);
  assert.equal(f.calls.includes('delete'), false);
  assert.equal(closed.events.at(-1).type, E.CLOSED);
  assert.equal(closed.archives.length, 1);
  const html = f.transcripts.read(closed.closing.transcript).toString();
  assert(html.includes('&lt;script&gt;'));
  assert(!html.includes('<script>'));
  const remove = f.adapter.removeChannel;
  f.adapter.removeChannel = async current => {
    assert.equal(f.repository.get(ids.guild, ticket.id).status, S.CLOSED);
    assert(f.logs.has(current.closing.logMessageId));
    return remove(current);
  };
  await f.service.removeChannel(f.logAction(closed));
  assert.equal(f.repository.get(ids.guild, ticket.id).channelId, null);
  assert.equal(f.channels.size, 0);
});

for (const stage of ['fetchMessages', 'publishClosed', 'lockChannel']) {
  test(`falha em ${stage} preserva canal e permite retomar após reinício`, async t => {
    const f = ticketFixture(t); const ticket = await f.create();
    const original = f.adapter[stage];
    f.adapter[stage] = async () => { throw new Error('SDK com conteúdo privado'); };
    await assert.rejects(f.close(ticket), /canal foi preservado/);
    assert(f.channels.has(ticket.channelId));
    assert.equal(f.calls.includes('delete'), false);
    await assert.rejects(f.service.removeChannel(f.logAction(ticket)));
    await assert.rejects(f.service.claim(f.action(ticket)));
    f.adapter[stage] = original;
    const closed = await f.makeService().close({ ...f.action(ticket), reason: 'Outro motivo', summary: '' });
    assert.equal(closed.status, S.CLOSED);
    assert.equal(closed.closing.reason, 'Resolvido');
    assert.equal(closed.events.filter(event => event.type === E.CLOSED).length, 1);
  });
}

test('falha de persistência durante fechamento jamais autoriza exclusão', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  const save = f.repository.save.bind(f.repository);
  f.repository.save = current => { if (current.closing?.transcript) throw new Error('Disco cheio'); return save(current); };
  await assert.rejects(f.close(ticket), /canal foi preservado/);
  assert(f.channels.has(ticket.channelId));
  assert.equal(f.logs.size, 0);
  assert.equal(f.calls.includes('delete'), false);
});

test('mensagens durante fechamento entram no transcript final e falha ao atualizar log é recuperável', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  const lock = f.adapter.lockChannel;
  let inserted = false;
  f.adapter.lockChannel = async current => {
    if (!inserted) f.channels.get(current.channelId).messages.push({ id: '100000000000000002', authorId: ids.user, authorName: 'Usuário', createdAt: new Date(f.now()).toISOString(), content: 'Mensagem durante coleta' });
    inserted = true; return lock(current);
  };
  const publish = f.adapter.publishClosed; let calls = 0;
  f.adapter.publishClosed = async (...args) => { if (++calls === 2) throw new Error('Falha no log final'); return publish(...args); };
  await assert.rejects(f.close(ticket));
  const closed = await f.makeService().close({ ...f.action(ticket), reason: 'Retry' });
  assert.equal(closed.closing.transcript.messageCount, 2);
  assert(f.logs.get(closed.closing.logMessageId).toString().includes('Mensagem durante coleta'));
});

test('log ausente, arquivo corrompido, ciclo velho e usuário comum bloqueiam remoção', async t => {
  const f = ticketFixture(t); const ticket = await f.close(await f.create());
  await assert.rejects(f.service.removeChannel({ ...f.logAction(ticket), userId: ids.user }), { statusCode: 403 });
  await assert.rejects(f.service.removeChannel({ ...f.logAction(ticket), cycle: 1 }));
  const log = f.logs.get(ticket.closing.logMessageId);
  f.logs.clear(); await assert.rejects(f.service.removeChannel(f.logAction(ticket)));
  f.logs.set(ticket.closing.logMessageId, log);
  fs.writeFileSync(f.transcriptRepository.file(ticket.closing.transcript.key), 'corrompido');
  await assert.rejects(f.service.removeChannel(f.logAction(ticket)), /inconsistente/);
  assert(f.channels.has(ticket.channelId));
});

test('criador pode fechar; membro comum não proprietário ou staff revogado não pode', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  f.actors.get(ids.staff).roleIds = [];
  await assert.rejects(f.close(ticket), { statusCode: 403 });
  await assert.rejects(f.service.claim(f.action(ticket)), { statusCode: 403 });
  assert.equal((await f.service.close({ ...f.action(ticket), userId: ids.user, reason: 'Resolvido' })).status, S.CLOSED);
});

test('reabertura extrema mantém ID e sequência, recria canal e anexa transcript anterior após reinício', async t => {
  const f = ticketFixture(t); const ticket = await f.close(await f.create());
  await assert.rejects(f.service.reopen(f.logAction(ticket)), /60 segundos/);
  await f.service.removeChannel(f.logAction(ticket));
  f.advance();
  await assert.rejects(f.service.reopen({ ...f.logAction(ticket), userId: ids.user }), { statusCode: 403 });
  const reopened = await f.makeService().reopen(f.logAction(ticket));
  assert.equal(reopened.id, ticket.id); assert.equal(reopened.sequence, ticket.sequence);
  assert.notEqual(reopened.channelId, ticket.channelId);
  assert.equal(reopened.status, S.REOPENED); assert.equal(reopened.reopenCount, 1);
  assert.equal(reopened.assignedUserId, null);
  assert.equal(reopened.events.at(-1).type, E.REOPENED);
  assert(f.calls.includes('initialWithTranscript'));
  await assert.rejects(f.service.reopen(f.logAction(ticket)));
  const closedAgain = await f.close(reopened);
  assert.equal(closedAgain.archives.length, 2);
  await assert.rejects(f.service.removeChannel(f.logAction(ticket)));
});

test('reabertura interrompida retoma o novo canal reservado e respeita limite do criador', async t => {
  const f = ticketFixture(t); const ticket = await f.close(await f.create());
  f.advance();
  const extra = await f.create();
  await assert.rejects(f.service.reopen(f.logAction(ticket)), /ativo nesta categoria/);
  await f.close(extra); f.advance();
  const original = f.adapter.publishInitial;
  f.adapter.publishInitial = async () => { throw new Error('Falha'); };
  await assert.rejects(f.service.reopen(f.logAction(ticket)));
  const channelId = f.repository.get(ids.guild, ticket.id).reopening.channelId;
  f.adapter.publishInitial = original;
  const reopened = await f.makeService().reopen(f.logAction(ticket));
  assert.equal(reopened.channelId, channelId);
  assert.equal(reopened.reopenCount, 1);
});
