require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const { drizzle } = require('drizzle-orm/node-postgres');
const { ticketFixture, ids } = require('./helpers/ticketFixture');
const { ticketAIFixture } = require('./helpers/ticketAIFixture');
const { TicketToolsService, toolPolicy, MAX_TIMEOUT_MS } = require('../src/Ticket/services/ticketToolsService');
const { ticketActions } = require('../src/Ticket/services/ticketReadService');
const { ticketFilters } = require('../src/Ticket/services/ticketFilters');
const { PostgresTicketRepository } = require('../src/Ticket/repositories/postgresTicketRepository');
const { safeAttachments } = require('../src/Ticket/services/ticketAttachments');
const { TicketPermissionService } = require('../src/Ticket/services/ticketPermissionService');

for (const status of ['OPEN', 'CLAIMED', 'REOPENED']) for (const outcome of ['CLOSED', 'CONCLUDED']) {
  test(`${status} → ${outcome} → REOPENED preserva transcript e resultado do ciclo`, async t => {
    const f = ticketFixture(t); let ticket = await f.create();
    if (status === 'REOPENED') { ticket = await f.close(ticket); f.advance(); ticket = await f.service.reopen(f.logAction(ticket)); }
    if (status === 'CLAIMED') ticket = await f.service.claim(f.action(ticket));
    ticket = await f.service[outcome === 'CONCLUDED' ? 'conclude' : 'close']({ ...f.action(ticket), reason: 'Motivo', summary: 'Orientação resolveu o problema' });
    assert.equal(ticket.status, outcome);
    assert.equal(ticket.archives.at(-1).status, outcome);
    assert.equal(ticket.events.at(-1).type, outcome === 'CONCLUDED' ? 'TICKET_CONCLUDED' : 'TICKET_CLOSED');
    assert.match(f.transcripts.read(ticket.closing.transcript).toString(), outcome === 'CONCLUDED' ? /Concluído \(solucionado\)/ : /Encerrado \(sem solução\)/);
    f.advance(); ticket = await f.service.reopen(f.logAction(ticket));
    assert.equal(ticket.status, 'REOPENED'); assert.equal(ticket.closing, null);
    assert.equal(ticket.archives.at(-1).status, outcome);
  });
}
test('concluir exige staff e solução; falha retomável conserva outcome e impede troca para CLOSED', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  await assert.rejects(f.service.conclude({ ...f.action(ticket), userId: ids.user, summary: 'Solução' }), { statusCode: 403 });
  await assert.rejects(f.service.conclude({ ...f.action(ticket), summary: '' }), { statusCode: 400 });
  const publish = f.adapter.publishClosed;
  f.adapter.publishClosed = async () => { throw new Error('Fake outage'); };
  await assert.rejects(f.service.conclude({ ...f.action(ticket), summary: 'Resolvido' }), { statusCode: 503 });
  const partial = f.repository.get(ids.guild, ticket.id);
  const actions = ticketActions(partial, f.actors.get(ids.staff), f.permissions);
  assert.equal(actions.canConclude, true); assert.equal(actions.canClose, false); assert.equal(actions.canRespond, false);
  await assert.rejects(f.close(partial), { statusCode: 409 });
  f.adapter.publishClosed = publish;
  const finished = await f.makeService().conclude(f.action(partial));
  assert.equal(finished.status, 'CONCLUDED'); assert.equal(finished.closing.summary, 'Resolvido');
  assert.equal(finished.events.filter(event => event.type === 'TICKET_CONCLUDED').length, 1);
  f.channels.delete(finished.channelId);
  assert.equal((await f.reconciliation.channelDeleted({ guildId: ids.guild, channelId: finished.channelId })).status, 'CONCLUDED');
});
test('stats distinguem ativos, encerrados e concluídos, incluindo zero e várias guilds', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  for (const [index, status] of ['CLAIMED', 'REOPENED', 'CLOSED', 'CONCLUDED'].entries()) f.repository.create({ ...ticket, status, sequence: index + 2 });
  const stats = f.repository.getStatsByGuildIds([ids.guild, ids.otherGuild]);
  assert.deepEqual(stats.get(ids.guild), { total: 5, open: 3, closed: 1, concluded: 1 });
  assert.deepEqual(stats.get(ids.otherGuild), { total: 0, open: 0, closed: 0, concluded: 0 });
});
test('filtros usam SQL parametrizado, VIEW e cursor antes de LIMIT, com uma agregação de stats', async () => {
  const queries = [];
  const db = drizzle({ query: async (query, params) => { queries.push({ sql: query.text, params }); return { rows: [] }; } });
  const repository = new PostgresTicketRepository(db);
  const access = { userId: ids.staff, roleIds: [ids.role], admin: false };
  for (const filters of [{ status: 'CONCLUDED' }, { category: 'support' }, { assigned: 'me' }, { assigned: 'unassigned' }, { assigned: ids.admin }, { from: '2026-10-01T00:00:00.000Z' }, { to: '2026-10-06T23:59:59.999Z' }, { search: '#428' }, { status: 'CLAIMED', category: 'support', assigned: 'me', from: '2026-10-01T00:00:00.000Z', to: '2026-10-06T23:59:59.999Z', search: '50%_suporte' }]) {
    await repository.listVisiblePage(ids.guild, { ...access, limit: 1, before: 40, filters });
    const query = queries.at(-1);
    assert.match(query.sql, /where .*guild_id.*creator_user_id.*support_role_ids.*public_number.*order by .* limit/);
    assert.equal(query.params.at(-2), 40); assert.equal(query.params.at(-1), 2);
    if (filters.assigned === 'me') assert.equal(query.params.includes(ids.staff), true);
    if (filters.assigned === 'unassigned') assert.match(query.sql, /assigned_user_id" is null/);
    if (filters.search) assert.match(query.sql, /ilike/);
  }
  const before = queries.length;
  assert.deepEqual(await repository.getVisibleStats(ids.guild, access), { total: 0, open: 0, closed: 0, concluded: 0 });
  assert.equal(queries.length, before + 1); assert.match(queries.at(-1).sql, /count\(\*\) filter.*CONCLUDED/);
  assert.match(queries.at(-1).sql, /creator_user_id.*support_role_ids/);
  for (const input of [{ status: 'RESOLVED' }, { assigned: 'other' }, { category: '../../x' }, { from: '2026-02-30T00:00:00.000Z' }, { from: '2026-10-06T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }, { search: 'x'.repeat(101) }]) assert.throws(() => ticketFilters(input), { statusCode: 400 });
});

const role = (id, position, bits = 0n, managed = false) => ({ id, name: id, managed, permissions: new PermissionsBitField(bits), position, comparePositionTo(other) { return this.position - other.position; } });
function discordFixture() {
  const roles = [role(ids.guild, 0), role('safe', 2), role('managed', 2, 0n, true), role('high', 20), role('escalation', 2, P.Administrator)];
  const member = (id, position, permissions) => ({ id, displayName: id, user: { bot: false }, permissions: new PermissionsBitField(permissions), roles: { highest: role(id + '-role', position), cache: new Map() } });
  const actor = member(ids.staff, 10, P.ManageRoles | P.ModerateMembers | P.BanMembers);
  actor.roles.cache.set(ids.role, role(ids.role, 9));
  return { guild: { id: ids.guild, ownerId: ids.admin }, actor, bot: member('999999999999999999', 15, P.ManageRoles | P.ModerateMembers | P.BanMembers), target: member(ids.user, 1, 0n), roles: new Map(roles.map(item => [item.id, item])) };
}
test('ferramentas exigem bits próprios, ambos os lados e hierarquia; nenhum cargo escalável', () => {
  const context = discordFixture();
  assert.deepEqual(toolPolicy(context).roles.map(item => item.id), ['safe']);
  assert.equal(toolPolicy(context).canTimeout, true); assert.equal(toolPolicy(context).canBan, true);
  assert.equal(toolPolicy(context).canRemoveTimeout, false);
  context.target.communicationDisabledUntilTimestamp = Date.now() + 300000;
  assert.equal(toolPolicy(context).canRemoveTimeout, true);
  context.roles.set('above-actor', role('above-actor', 11));
  assert.deepEqual(toolPolicy(context).roles.map(item => item.id), ['safe']);
  context.actor.permissions = new PermissionsBitField(P.ManageGuild);
  assert.equal(toolPolicy(context).canBan, false); assert.equal(toolPolicy(context).canTimeout, false); assert.equal(toolPolicy(context).canManageRoles, false);
  context.actor.permissions = new PermissionsBitField(P.ModerateMembers);
  context.bot.permissions = new PermissionsBitField(0n);
  assert.equal(toolPolicy(context).canTimeout, false);
  context.bot.permissions = new PermissionsBitField(P.ModerateMembers);
  context.target.roles.highest.position = 10; assert.equal(toolPolicy(context).canTimeout, false);
  context.target.roles.highest.position = 1; context.target.id = context.guild.ownerId; assert.equal(toolPolicy(context).canTimeout, false);
  context.target.id = ids.user; context.target.permissions = new PermissionsBitField(P.Administrator); assert.equal(toolPolicy(context).canTimeout, false);
});
test('ações de moderação resolvem alvo do ticket, revalidam e auditam sucesso/negação sem ban real', async t => {
  const f = ticketFixture(t); const ticket = await f.create(); const discord = discordFixture(); const executed = [];
  f.adapter.toolContext = async input => { assert.equal(input.creatorUserId, ticket.creatorUserId); return discord; };
  f.adapter.executeTool = async (_context, input) => { executed.push(input); };
  const service = new TicketToolsService({ tickets: f.service, permissions: f.permissions, adapter: f.adapter });
  const input = { guildId: ids.guild, ticketId: ticket.id, userId: ids.staff, confirm: true, reason: 'Motivo operacional' };
  await service.execute({ ...input, action: 'timeout', durationMs: 300000 });
  await service.execute({ ...input, action: 'add-role', roleId: 'safe' });
  await service.execute({ ...input, action: 'ban' });
  assert.equal(executed.length, 3);
  assert.equal(f.repository.get(ids.guild, ticket.id).events.filter(item => item.type === 'TICKET_TOOL' && item.metadata.result === 'success').length, 3);
  for (const fields of [{ action: 'timeout', durationMs: MAX_TIMEOUT_MS + 1 }, { action: 'add-role', roleId: 'managed' }, { action: 'ban', confirm: false }, { action: 'ban', reason: '' }, { action: 'ban', userId: ids.user }]) await assert.rejects(service.execute({ ...input, ...fields }));
  discord.actor.permissions = new PermissionsBitField(P.ManageGuild);
  await assert.rejects(service.execute({ ...input, action: 'ban' }), { statusCode: 403 });
  assert.equal(executed.length, 3);
  assert.equal(f.repository.get(ids.guild, ticket.id).events.at(-1).metadata.result, 'failed');
  discord.actor.permissions = new PermissionsBitField(P.ModerateMembers);
  discord.actor.roles.cache.clear();
  await assert.rejects(service.execute({ ...input, action: 'timeout', durationMs: 300000 }), { statusCode: 403 });
  assert.equal(executed.length, 3, 'cargo de suporte revogado na segunda leitura também impede execução');
});
test('anexo Discord sem texto é persistido no core, DTO e transcript; URLs perigosas são excluídas', async t => {
  const f = await ticketAIFixture(t); const file = { name: '<img>.pdf', size: 123, url: 'https://cdn.discordapp.com/attachments/1/2/file.pdf', contentType: 'application/pdf' };
  const result = await f.messageService.ingestDiscordMessage({ guildId: ids.guild, channelId: f.ticket.channelId, messageId: '100000000000000099', userId: ids.user, content: '', attachments: [file] });
  assert.equal(result.message.content, '[Anexo]');
  assert.deepEqual(f.messageService.dto(result.message).attachments, [file]);
  assert.deepEqual(safeAttachments([{ ...file, url: 'javascript:alert(1)' }, { ...file, url: 'https://cdn.discordapp.com.evil.com/a' }, { ...file, url: 'https://user@cdn.discordapp.com/a' }]), []);
  const html = f.core.transcripts.render({ ...f.ticket, closing: { startedAt: Date.now(), outcome: 'CONCLUDED', summary: 'OK' } }, [{ ...result.message, authorId: ids.user, attachments: [file] }], true);
  assert.match(html, /&lt;img&gt;.pdf/); assert.doesNotMatch(html, /<img>/);
});

test('dono e cargo Administrator têm acesso aos tickets', async () => {
  const actors = new Map([
    ['100000000000000001', { id: '100000000000000001', bot: false, owner: true, roleIds: [], permissions: '0' }],
    ['100000000000000002', { id: '100000000000000002', bot: false, owner: false, roleIds: [], permissions: P.Administrator.toString() }],
  ]);
  const permissions = new TicketPermissionService({ getActor: async (_guildId, userId) => actors.get(userId) });
  const ticket = { creatorUserId: ids.user };
  const config = { supportRoleIds: [] };
  assert.equal((await permissions.requireView(ids.guild, '100000000000000001', config, ticket)).owner, true);
  assert.equal((await permissions.requireView(ids.guild, '100000000000000002', config, ticket)).id, '100000000000000002');
});
