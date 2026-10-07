require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { PlanService, PLANS } = require('../src/services/planService');
const { requireAnnouncementAccess } = require('../src/services/announcementAccessService');
const { createRequestHandler } = require('../src/api/server');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { loadEnv } = require('../src/config/env');
const { announcementClient } = require('./helpers/announcementClient');
const { PermissionFlagsBits: P } = require('discord.js');
const guildId = '1548161474227077212', userId = '1548161474227077213';
test('catálogo mantém Plus pessoal e Comunidade por servidor; sem armazenamento não concede Premium', async () => {
  assert.deepEqual(PLANS.map(p => [p.name, p.scope]), [['CYL Plus', 'user'], ['CYL Comunidade', 'guild']]);
  const service = new PlanService(null);
  assert.deepEqual((await service.personal(userId)).subscriptions, []);
  await assert.rejects(service.requireCommunityGuild(guildId), { code: 'COMMUNITY_PLAN_REQUIRED' });
  await assert.rejects(service.activate(userId, guildId), { code: 'COMMUNITY_PLAN_REQUIRED' });
});
test('Plus, Comunidade expirada, revogada e datas inválidas nunca habilitam servidor', async () => {
  let record; const plans = new PlanService({ forGuild: async () => record }, { now: () => 1000 });
  for (const input of [null, { plan: 'PLUS', status: 'ACTIVE', expiresAt: new Date(2000).toISOString() },
    { plan: 'COMMUNITY', status: 'REVOKED', expiresAt: new Date(2000).toISOString() },
    { plan: 'COMMUNITY', status: 'ACTIVE', expiresAt: new Date(1000).toISOString() },
    { plan: 'COMMUNITY', status: 'ACTIVE', expiresAt: 'invalid' }]) {
    record = input; await assert.rejects(plans.requireCommunityGuild(guildId), { code: 'COMMUNITY_PLAN_REQUIRED' });
  }
  record = { plan: 'COMMUNITY', status: 'ACTIVE', expiresAt: new Date(2000).toISOString() };
  assert.equal(await plans.requireCommunityGuild(guildId), record);
});
test('permissão atual é consultada novamente; dono e admin entram, ManageGuild e usuário comum não', async () => {
  const client = announcementClient(guildId, userId);
  const context = { client, services: client.services };
  assert.equal((await requireAnnouncementAccess(context, guildId, userId)).id, guildId);
  for (const permissions of [P.ManageGuild, 0n]) {
    client.guilds.cache.get(guildId).members = announcementClient(guildId, userId, permissions).guilds.cache.get(guildId).members;
    await assert.rejects(requireAnnouncementAccess(context, guildId, userId), { code: 'ADMINISTRATOR_REQUIRED' });
  }
  client.guilds.cache.get(guildId).ownerId = userId;
  assert.equal((await requireAnnouncementAccess(context, guildId, userId)).id, guildId);
  await assert.rejects(requireAnnouncementAccess(context, 'other', userId), { code: 'ADMINISTRATOR_REQUIRED' });
});
test('API de planos usa titular da sessão e exige admin ao vincular; não permite autoatribuir plano', async () => {
  const sessions = new AuthSessionManager(); const session = sessions.create({ id: userId }, { access_token: 'synthetic', expires_in: 3600, scope: 'identify guilds' });
  const config = loadEnv({}, { requireDiscord: false }).auth;
  const client = announcementClient(guildId, userId); let activated = 0, deactivated = 0;
  const services = { auth: { config, sessions }, plans: {
    personal: async id => { assert.equal(id, userId); return { subscriptions: [] }; },
    activate: async (id, guild) => { assert.equal(id, userId); assert.equal(guild, guildId); activated++; return { active: true }; },
    deactivate: async id => { assert.equal(id, userId); deactivated++; return { active: false }; },
  } };
  const handler = createRequestHandler({ client, services });
  async function request(path, method = 'GET', body = {}, authenticated = true, origin = config.webOrigin) {
    const input = Object.assign(Readable.from([JSON.stringify(body)]), { method, url: path,
      headers: { origin, ...(authenticated ? { cookie: `cylbot_session=${session.id}` } : {}) }, socket: { remoteAddress: 'local' } });
    const result = { setHeader() {}, writeHead(status) { this.status = status; return this; }, end(value) { this.body = value ? JSON.parse(value) : null; } };
    await handler(input, result); return result;
  }
  assert.equal((await request('/api/plans/me', 'GET', {}, false)).status, 401);
  assert.equal((await request('/api/plans/me')).status, 200);
  assert.equal((await request('/api/plans/community/guilds', 'POST', { guildId, userId: 'forged' })).status, 200);
  client.guilds.cache.get(guildId).members = announcementClient(guildId, userId, 0n).guilds.cache.get(guildId).members;
  assert.equal((await request('/api/plans/community/guilds', 'POST', { guildId })).status, 403);
  assert.equal((await request('/api/plans/community/guilds', 'DELETE', { guildId })).status, 200);
  assert.equal((await request('/api/plans/community/guilds', 'POST', { guildId }, true, 'https://untrusted.example')).status, 403);
  assert.equal((await request('/api/plans/grant', 'POST', { plan: 'COMMUNITY' })).status, 404);
  assert.equal(activated, 1); assert.equal(deactivated, 1);
});
test('ações Discord negam usuários comuns e plano ausente antes de gerar, editar ou enviar', async () => {
  const { handleAnnouncementInteraction } = require('../src/handlers/announcementHandler');
  for (const failure of ['role', 'plan']) {
    const client = announcementClient(guildId, userId, failure === 'role' ? 0n : P.Administrator);
    if (failure === 'plan') client.services.plans = new PlanService(null);
    for (const action of ['back', 'choose', 'add', 'edit', 'save', 'generate', 'revise', 'send']) {
      let denial;
      await handleAnnouncementInteraction({ client, guildId, user: { id: userId }, customId: `ann:${action}:draft`, reply: async value => { denial = value; } }, {});
      assert.equal(denial.ephemeral, true); assert.match(denial.content, failure === 'role' ? /administrador/ : /CYL Comunidade/);
    }
  }
});
