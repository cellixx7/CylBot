require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { randomUUID } = require('node:crypto');
const { PermissionFlagsBits: P } = require('discord.js');
const { ticketAIFixture, ids } = require('./helpers/ticketAIFixture');
const { loadEnv } = require('../src/config/env');
const { AuthService } = require('../src/services/authService');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { DashboardService } = require('../src/services/dashboardService');
const { TicketReadService } = require('../src/Ticket/services/ticketReadService');
const { createRequestHandler } = require('../src/api/server');

async function setup(t, userId = ids.user) {
  const f = await ticketAIFixture(t);
  const rows = [f.ticket, { ...f.ticket, id: randomUUID(), sequence: 2, creatorUserId: ids.admin, status: 'CLOSED' }];
  const queries = [];
  f.core.repository.listVisiblePage = async (guildId, input) => {
    queries.push(input);
    const visible = rows.filter(ticket => ticket.guildId === guildId && (input.admin || ticket.creatorUserId === input.userId ||
      ticket.supportRoleIds.some(role => input.roleIds.includes(role))) && (!input.before || ticket.sequence < input.before))
      .sort((a, b) => b.sequence - a.sequence);
    return { tickets: visible.slice(0, input.limit), nextBefore: visible.length > input.limit ? visible[input.limit - 1].sequence : null };
  };
  const config = loadEnv({}, { requireDiscord: false }).auth;
  const sessions = new AuthSessionManager();
  const session = sessions.create({ id: userId }, { access_token: 'synthetic', expires_in: 3600, scope: 'identify guilds' });
  const memberships = [{ id: ids.guild, name: 'Guild', permissions: '0', owner: false }];
  const provider = { getCurrentUserGuilds: async () => memberships };
  const client = { isReady: () => true, guilds: { cache: new Map([[ids.guild, {}], [ids.otherGuild, {}]]) } };
  const services = {
    auth: new AuthService({ config, sessions, provider }), dashboard: new DashboardService({ provider, client }),
    ticketRead: new TicketReadService({ tickets: f.core.service, permissions: f.core.permissions, messages: f.messageService }),
    ticketMessages: f.messageService,
  };
  const handler = createRequestHandler({ services, client });
  const request = async (path, { authenticated = true, method = 'GET' } = {}) => {
    const req = Object.assign(Readable.from([]), { method, url: path,
      headers: { ...(authenticated ? { cookie: `cylbot_session=${session.id}` } : {}), origin: config.webOrigin }, socket: {} });
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); return this; },
      end(value) { this.body = value ? JSON.parse(value) : null; } };
    await handler(req, res); return res;
  };
  return { ...f, rows, queries, memberships, request, services, sessions, session,
    list: `/api/tickets?guildId=${ids.guild}`, detail: `/api/tickets/${f.ticket.id}?guildId=${ids.guild}` };
}

test('criador lista apenas seus tickets; detalhe usa allowlist sem dados de lifecycle', async t => {
  const f = await setup(t);
  const list = await f.request(f.list);
  assert.equal(list.status, 200);
  assert.equal(list.headers['Cache-Control'], 'no-store');
  assert.deepEqual(list.body.tickets.map(ticket => ticket.id), [f.ticket.id]);
  assert.equal(f.queries[0].admin, false);
  const detail = await f.request(f.detail);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.ticket.subject, f.ticket.subject);
  assert.equal(detail.body.ticket.publicNumber, 1);
  assert.deepEqual(Object.keys(detail.body.ticket).sort(), ['id', 'guildId', 'guildName', 'publicNumber', 'subject', 'description',
    'status', 'categoryName', 'creatorName', 'assignedName', 'createdAt', 'claimedAt', 'closedAt', 'reopenedAt', 'actions'].sort());
  assert.deepEqual(detail.body.ticket.actions, { canClaim: false, canRespond: true, canClose: true, canReopen: false });
  assert.equal(f.core.calls.includes('messages'), false, 'leitura não importa histórico Discord');
});

test('suporte sem ManageGuild pagina todos os tickets permitidos, inclusive fechados, e perde acesso ao perder cargo', async t => {
  const f = await setup(t, ids.staff);
  const first = await f.request(`${f.list}&limit=1`);
  assert.equal(first.status, 200); assert.equal(first.body.tickets[0].status, 'CLOSED');
  assert.equal(first.body.nextBefore, 2);
  const second = await f.request(`${f.list}&limit=1&before=2`);
  assert.equal(second.body.tickets[0].id, f.ticket.id); assert.equal(second.body.nextBefore, null);
  assert.equal((await f.request(f.detail)).status, 200);
  f.core.actors.get(ids.staff).roleIds = [];
  assert.deepEqual((await f.request(f.list)).body.tickets, []);
  assert.equal((await f.request(f.detail)).status, 403);
});

test('ManageGuild e Administrator usam permissões atuais do bot, sem confiar em OAuth ou browser', async t => {
  const f = await setup(t, ids.admin);
  assert.equal((await f.request(f.list)).body.tickets.length, 2);
  assert.equal(f.queries.at(-1).admin, true);
  f.core.actors.get(ids.admin).permissions = P.Administrator.toString();
  assert.equal((await f.request(f.detail)).status, 200);
  f.core.actors.get(ids.admin).permissions = '0';
  assert.equal((await f.request(`${f.list}&userId=${ids.staff}&admin=true`)).body.tickets.length, 1);
  assert.equal((await f.request(f.detail)).status, 403);
});

test('sessão, membership, isolamento de guild e validações são obrigatórios em lista/detalhe', async t => {
  const f = await setup(t);
  for (const path of [f.list, f.detail]) {
    assert.equal((await f.request(path, { authenticated: false })).status, 401);
    assert.equal((await f.request(path, { method: 'POST' })).status, 405);
    assert.equal((await f.request(path.replace(ids.guild, 'invalid'))).status, 400);
  }
  for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'before=invalid', 'before=0', 'before=2147483648']) {
    assert.equal((await f.request(`${f.list}&${query}`)).status, 400);
  }
  f.memberships.push({ id: ids.otherGuild, name: 'Other', permissions: '0' });
  assert.equal((await f.request(f.detail.replace(ids.guild, ids.otherGuild))).status, 404);
  assert.equal((await f.request(`/api/tickets/${randomUUID()}?guildId=${ids.guild}`)).status, 404);
  f.memberships.length = 0;
  assert.equal((await f.request(f.list)).status, 403);
  assert.equal((await f.request(f.detail)).status, 403);
});

test('histórico canônico filtra mensagens internas, reflete novas mensagens e lê ticket fechado sem canal', async t => {
  const f = await setup(t);
  f.messages.push({ ...f.messages[0], id: randomUUID(), content: 'Segredo', visibility: 'INTERNAL' },
    { ...f.messages[0], id: randomUUID(), content: 'Sistema', visibility: 'SYSTEM' });
  const path = `/api/tickets/${f.ticket.id}/messages?guildId=${ids.guild}`;
  assert.equal((await f.request(path)).body.messages.length, 1);
  f.messages.push({ ...f.messages[0], id: randomUUID(), content: '<script>literal</script>', origin: 'WEB' });
  const next = await f.request(path);
  assert.equal(next.body.messages.length, 2);
  assert.equal(next.body.messages[1].content, '<script>literal</script>');
  assert.equal('deliveryErrorCode' in next.body.messages[0], false);
  const ticket = await f.core.repository.get(ids.guild, f.ticket.id);
  await f.core.repository.save({ ...ticket, status: 'CLOSED', channelId: null });
  assert.equal((await f.request(f.detail)).body.ticket.status, 'CLOSED');
  assert.equal((await f.request(path)).status, 200);
  f.core.actors.get(ids.user).roleIds = [ids.role];
  const staffMessages = (await f.request(path)).body.messages;
  assert.equal(staffMessages.length, 3);
  assert.equal(staffMessages.some(message => message.visibility === 'SYSTEM'), false);
  f.core.actors.get(ids.user).roleIds = [];
  assert.equal((await f.request(path)).body.messages.length, 2);
});

test('sem PostgreSQL a consulta informa indisponibilidade; GET não inicia escrita, IA ou delivery', async t => {
  const f = await setup(t);
  f.messageService.repository = null;
  assert.equal((await f.request(f.list)).status, 503);
  assert.equal((await f.request(f.detail)).status, 503);
  assert.equal(f.sent.length, 0); assert.equal(f.requests.length, 0);
});

test('sessão expirada durante membership é rejeitada e lista participa do rate limit', async t => {
  const f = await setup(t);
  f.services.dashboard.requireGuildMembership = async () => { f.session.expiresAt = 0; };
  assert.equal((await f.request(f.list)).status, 401);
  const g = await setup(t);
  for (let i = 0; i < 30; i++) assert.equal((await g.request(g.list)).status, 200);
  const limited = await g.request(g.list);
  assert.equal(limited.status, 429); assert(limited.headers['Retry-After']);
});
