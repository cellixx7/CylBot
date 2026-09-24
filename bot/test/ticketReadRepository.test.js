require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { PostgresTicketRepository } = require('../src/Ticket/repositories/postgresTicketRepository');
const { createDatabase } = require('../src/database/client');

test('consulta SQL aplica guild, VIEW e cursor antes do LIMIT, sem carregar eventos', async () => {
  const queries = [];
  const db = drizzle({ query: async (query, params) => { queries.push({ sql: query.text, params }); return { rows: [] }; } });
  const repository = new PostgresTicketRepository(db);
  const input = { userId: 'creator', roleIds: ['support'], admin: false, limit: 25, before: 10 };
  await repository.listVisiblePage('guild', input);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /"guild_id" = .* and .*"creator_user_id" = .* or .*"support_role_ids" && .* and .*"public_number" < .*order by .*"public_number" desc limit/);
  assert.deepEqual(queries[0].params, ['guild', 'creator', '{"support"}', 10, 26]);
  await repository.listVisiblePage('guild', { ...input, roleIds: [], before: undefined });
  assert.doesNotMatch(queries[1].sql, /&&/);
  assert.deepEqual(queries[1].params, ['guild', 'creator', 26]);
  await repository.listVisiblePage('guild', { ...input, admin: true });
  assert.deepEqual(queries[2].params, ['guild', 10, 26]);
});

test('PostgreSQL lista por acesso antes de paginar e mantém isolamento entre guilds', { skip: !process.env.DATABASE_TEST_URL }, async () => {
  const database = createDatabase(process.env.DATABASE_TEST_URL);
  const guild = `read-test-${randomUUID()}`; const otherGuild = `${guild}-other`;
  try {
    const connection = await database.pool.connect();
    try {
      await connection.query('select pg_advisory_lock(736821)');
      await migrate(drizzle(connection), { migrationsFolder: path.join(__dirname, '../src/database/migrations') });
    } finally { await connection.query('select pg_advisory_unlock(736821)'); connection.release(); }
    for (const [number, creator, roles, status, guildId] of [
      [1, 'owner', ['support'], 'OPEN', guild], [2, 'other', ['other-role'], 'OPEN', guild],
      [3, 'other', ['support'], 'CLOSED', guild], [4, 'owner', ['support'], 'OPEN', otherGuild],
    ]) {
      await database.pool.query('insert into tickets (guild_id,public_number,creator_user_id,support_role_ids,subject,description,status,initialized) values ($1,$2,$3,$4,$5,$6,$7,true)',
        [guildId, number, creator, roles, 'Test', 'Read-only', status]);
    }
    const repo = new PostgresTicketRepository(database);
    const owner = { userId: 'owner', roleIds: [], admin: false, limit: 1 };
    assert.deepEqual((await repo.listVisiblePage(guild, owner)).tickets.map(ticket => ticket.publicNumber), [1]);
    const staff = { userId: 'staff', roleIds: ['support'], admin: false, limit: 1 };
    const page = await repo.listVisiblePage(guild, staff);
    assert.equal(page.tickets[0].publicNumber, 3); assert.equal(page.tickets[0].status, 'CLOSED'); assert.equal(page.nextBefore, 3);
    const older = await repo.listVisiblePage(guild, { ...staff, before: page.nextBefore });
    assert.equal(older.tickets[0].publicNumber, 1); assert.equal(older.nextBefore, null);
    assert.equal((await repo.listVisiblePage(guild, { ...staff, roleIds: [] })).tickets.length, 0);
    assert.equal((await repo.listVisiblePage(guild, { ...staff, admin: true, limit: 100 })).tickets.length, 3);
  } finally {
    await database.pool.query('delete from tickets where guild_id = any($1::text[])', [[guild, otherGuild]]);
    await database.close();
  }
});
