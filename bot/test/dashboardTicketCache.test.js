require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { loadEnv } = require('../src/config/env');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { DashboardService } = require('../src/services/dashboardService');
const { TicketPermissionService } = require('../src/Ticket/services/ticketPermissionService');
const { createRequestHandler } = require('../src/api/server');

const guildId = '1548161474227077212';

function fixture() {
  let time = 1000;
  let ready = true;
  let reads = 0;
  const client = { isReady: () => ready, guilds: { cache: new Map([[guildId, {}]]) } };
  const oauthGuild = { id: guildId, name: 'Guild', owner: true, permissions: '8', icon: null };
  const provider = { getCurrentUserGuilds: async () => { reads++; return [oauthGuild]; } };
  const sessions = new AuthSessionManager({ now: () => time });
  const session = sessions.create({ id: '123456789012345678' }, { access_token: 'synthetic-cache-test', expires_in: 3600, scope: 'identify guilds' });
  const dashboard = new DashboardService({ provider, client, now: () => time, guildCacheMs: 15000,
    ticketConfigs: { getMany: async () => [{ guildId, ready: true, supportRoleIds: [] }] },
    ticketRepository: { getStatsByGuildIds: async () => new Map() },
    ticketPermissions: new TicketPermissionService({ client }),
  });
  const services = { auth: { sessions, config: loadEnv({}, { requireDiscord: false }).auth }, dashboard,
    ticketRead: { list: async input => { assert.equal(input.guildId, guildId); return { tickets: [], stats: { total: 0 }, nextBefore: null }; } } };
  const handler = createRequestHandler({ client, services });
  const request = async url => {
    const req = Object.assign(Readable.from([]), { url, method: 'GET', headers: { cookie: `cylbot_session=${session.id}` }, socket: {} });
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, writeHead(status) { this.status = status; return this; }, end(body) { this.body = JSON.parse(body); } };
    await handler(req, res);
    return res;
  };
  return { client, dashboard, provider, session, request, reads: () => reads, advance: ms => { time += ms; }, setReady: value => { ready = value; } };
}

test('Dashboard seguido de Tickets reconhece a mesma guild instalada no cache OAuth', async () => {
  const f = fixture();
  const first = await f.request('/api/dashboard/guilds');
  assert.equal(first.status, 200);
  assert.equal(first.body.guilds[0].id, guildId);
  assert.equal(first.body.guilds[0].botInstalled, true);
  assert.equal(first.body.guilds[0].canViewTickets, true);
  const tickets = await f.request(`/api/tickets?guildId=${guildId}&limit=25`);
  assert.equal(tickets.status, 200, JSON.stringify(tickets.body));
  const cached = await f.request('/api/dashboard/guilds');
  assert.deepEqual(cached.body, first.body);
  assert.equal('permissions' in cached.body.guilds[0], false);
  assert.equal(f.reads(), 1);
});

test('cache OAuth reavalia presença atual do bot e readiness sem novo fetch', async () => {
  const f = fixture();
  await f.dashboard.guilds(f.session);
  f.client.guilds.cache.delete(guildId);
  assert.equal((await f.dashboard.guilds(f.session))[0].botInstalled, false);
  await assert.rejects(f.dashboard.requireGuildMembership(f.session, guildId), { code: 'GUILD_NOT_FOUND' });
  f.client.guilds.cache.set(guildId, {});
  assert.equal((await f.dashboard.requireGuildMembership(f.session, guildId)).botInstalled, true);
  f.setReady(false);
  await assert.rejects(f.dashboard.requireGuildMembership(f.session, guildId), { statusCode: 503 });
  assert.equal(f.reads(), 1);
});

test('fallback durante cooldown OAuth mantém DTO e membership atuais', async () => {
  const f = fixture();
  await f.dashboard.guilds(f.session);
  f.advance(15001);
  f.provider.getCurrentUserGuilds = async () => { throw Object.assign(new Error('rate limited'), { statusCode: 429, retryAfter: 12 }); };
  await assert.rejects(f.dashboard.guilds(f.session), { statusCode: 429 });
  assert.equal((await f.dashboard.requireGuildMembership(f.session, guildId)).botInstalled, true);
  const cached = await f.dashboard.guilds(f.session);
  assert.equal('permissions' in cached[0], false);
  f.client.guilds.cache.delete(guildId);
  assert.equal((await f.dashboard.guilds(f.session))[0].botInstalled, false);
});
