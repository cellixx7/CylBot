require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { drizzle } = require('drizzle-orm/node-postgres');
const { createDatabase } = require('../src/database/client');
const { PostgresTicketAIRepository } = require('../src/Ticket/repositories/postgresTicketAIRepository');
const { DEFAULT_CONFIG } = require('../src/Ticket/services/ticketAIContract');
const url = process.env.DATABASE_TEST_URL;
const run = url ? test : test.skip;

run('PostgreSQL IA persiste config/pausa/auditoria, isola guild e reserva somente uma execução concorrente', async () => {
  const database = createDatabase(url);
  const guildId = `ai-test-${randomUUID()}`;
  const ticketId = randomUUID();
  try {
    // Compartilha lock de migration com o teste do Core quando ambos executam juntos.
    const connection = await database.pool.connect();
    try {
      await connection.query('select pg_advisory_lock(736821)');
      await migrate(drizzle(connection), { migrationsFolder: path.join(__dirname, '../src/database/migrations') });
    } finally { await connection.query('select pg_advisory_unlock(736821)'); connection.release(); }
    await database.pool.query("insert into tickets (id,guild_id,public_number,subject,description,status,initialized) values ($1,$2,1,'Test','Test','OPEN',true)", [ticketId, guildId]);
    const repository = new PostgresTicketAIRepository(database);
    await repository.saveConfig(guildId, { ...DEFAULT_CONFIG, enabled: true, autonomyLevel: 2 });
    assert.equal((await new PostgresTicketAIRepository(database).getConfig(guildId)).autonomyLevel, 2);
    const runIds = [randomUUID(), randomUUID()];
    const outcomes = await Promise.all(runIds.map(runId => repository.reserve({ guildId, ticketId, runId, messageId: 'm1', now: Date.now(), audit: { trigger: 'message', model: 'mock' } })));
    assert.equal(outcomes.filter(Boolean).length, 1);
    await repository.locked(guildId, ticketId, async ({ patch, audit }) => {
      await patch({ paused: true, escalatedAt: new Date(), leaseId: null, leaseExpiresAt: null });
      await audit({ trigger: 'staff', status: 'paused', reason: 'staff_override' });
    });
    const restarted = new PostgresTicketAIRepository(database);
    assert.equal((await restarted.getState(guildId, ticketId)).paused, true);
    await assert.rejects(restarted.locked('other-guild', ticketId, () => assert.fail()), { statusCode: 404 });
    const runId = runIds[outcomes.findIndex(Boolean)];
    await restarted.finish(guildId, ticketId, runId, { status: 'denied', actionProposed: 'REPLY', inputTokens: 10, outputTokens: 5 });
    const { rows } = await database.pool.query('select status,input_tokens from ticket_ai_runs where id=$1', [runId]);
    assert.equal(rows[0].status, 'denied'); assert.equal(rows[0].input_tokens, 10);
  } finally {
    await database.pool.query('delete from tickets where guild_id=$1', [guildId]);
    await database.pool.query('delete from ticket_ai_configs where guild_id=$1', [guildId]);
    await database.close();
  }
});
