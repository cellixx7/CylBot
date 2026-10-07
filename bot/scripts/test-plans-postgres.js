// Testa em schema temporário exclusivo. Nenhum plano real é concedido ou revogado.
const { randomBytes } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { getConfig } = require('../src/config/env');
const { createDatabase } = require('../src/database/client');
const { PostgresPlanRepository } = require('../src/repositories/postgresPlanRepository');
const { PlanService } = require('../src/services/planService');
async function main() {
  const url = new URL(getConfig({ requireDiscord: false }).database.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Teste requer PostgreSQL local.');
  const database = createDatabase(url.toString());
  const name = `cyl_plans_test_${randomBytes(8).toString('hex')}`;
  let pool, created = false;
  const userId = '100000000000000001', otherUser = '100000000000000002';
  const guilds = ['200000000000000001', '200000000000000002', '200000000000000003'];
  try {
    await database.pool.query(`CREATE SCHEMA ${name}`); created = true;
    pool = new Pool({ connectionString: url.toString(), options: `-c search_path=${name}`, max: 4 });
    const sql = (await readFile(path.join(__dirname, '../src/database/migrations/0013_skinny_inhumans.sql'), 'utf8')).replaceAll('"public".', '');
    await pool.query(sql);
    const repository = new PostgresPlanRepository({ pool }); const service = new PlanService(repository);
    const expiresAt = new Date(Date.now() + 3600000);
    await repository.grant({ userId, plan: 'PLUS', serverLimit: 0, expiresAt });
    await assert.rejects(service.activate(userId, guilds[0]), { code: 'COMMUNITY_PLAN_REQUIRED' });
    await repository.grant({ userId, plan: 'COMMUNITY', serverLimit: 1, expiresAt });
    const concurrent = await Promise.allSettled(guilds.slice(0, 2).map(guild => service.activate(userId, guild)));
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(concurrent.find(r => r.status === 'rejected').reason.code, 'COMMUNITY_SERVER_LIMIT');
    const linked = (await repository.forUser(userId)).find(s => s.plan === 'COMMUNITY').guildIds[0];
    assert.equal((await new PostgresPlanRepository({ pool }).forGuild(linked)).userId, userId);
    await service.activate(userId, linked); // Idempotência não consome novo slot.
    assert.equal((await service.requireCommunityGuild(linked)).plan, 'COMMUNITY');
    await repository.grant({ userId: otherUser, plan: 'COMMUNITY', serverLimit: 1, expiresAt });
    await assert.rejects(service.activate(otherUser, linked), { code: 'GUILD_PLAN_ALREADY_LINKED' });
    await assert.rejects(service.deactivate(otherUser, linked), { code: 'PLAN_OWNER_REQUIRED' });
    await repository.revoke(userId, 'COMMUNITY');
    await assert.rejects(service.requireCommunityGuild(linked), { code: 'COMMUNITY_PLAN_REQUIRED' });
    await repository.grant({ userId, plan: 'COMMUNITY', serverLimit: 1, expiresAt: new Date(0) });
    await assert.rejects(service.requireCommunityGuild(linked), { code: 'COMMUNITY_PLAN_REQUIRED' });
    await assert.rejects(service.activate(userId, linked), { code: 'COMMUNITY_PLAN_REQUIRED' });
    await service.deactivate(userId, linked); // Titular pode remover vínculo expirado.
    await repository.grant({ userId, plan: 'COMMUNITY', serverLimit: 2, expiresAt });
    await service.activate(userId, guilds[0]); await service.activate(userId, guilds[1]);
    await assert.rejects(repository.grant({ userId, plan: 'COMMUNITY', serverLimit: 1, expiresAt }), { code: 'COMMUNITY_SERVER_LIMIT' });
    assert.equal((await service.personal(userId)).subscriptions.length, 2);
    console.log('PostgreSQL: persistência, planos, concorrência, limite, renovação, expiração, revogação e isolamento passaram.');
  } finally {
    if (pool) await pool.end();
    if (created) await database.pool.query(`DROP SCHEMA ${name} CASCADE`);
    await database.close();
  }
}
main().catch(error => { console.error(`Teste de planos PostgreSQL falhou: ${/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : error.name}.`); process.exitCode = 1; });
