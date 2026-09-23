const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { createDatabase } = require('../src/database/client');
const { PostgresTicketRepository } = require('../src/repositories/postgresTicketRepository');
const { TICKET_EVENT: E, TICKET_STATUS: S } = require('../src/services/ticketConstants');

const url = process.env.DATABASE_TEST_URL;
const run = url ? test : test.skip;

run('PostgreSQL mantém sequência, claim concorrente e ticket após novo repository', async () => {
  const database = createDatabase(url);
  const guildId = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const repository = new PostgresTicketRepository(database);
  await migrate(database.db, { migrationsFolder: path.join(__dirname, '../src/database/migrations') });
  const input = (userId, categoryId) => ({ guildId, guildName: 'Integration Test', creatorUserId: userId,
    creatorName: 'Test User', categoryId, categoryName: categoryId, subject: 'Test', description: 'Test', status: S.OPEN,
    assignedUserId: null, assignedName: null, createdAt: Date.now(), claimedAt: null, closedAt: null, reopenCount: 0,
    channelId: null, initialMessageId: null, openingLogId: null, logChannelId: 'log', supportRoleIds: [], initialized: true,
    events: [], archives: [], closing: null, reopening: null });
  try {
    const created = await Promise.all(['u1', 'u2', 'u3'].map((userId, index) => repository.createWithEvent(input(userId, `category-${index}`), {
      type: E.CREATED, actorUserId: userId, createdAt: Date.now(), metadata: {},
    })));
    assert.equal(new Set(created.map(ticket => ticket.publicNumber)).size, created.length);
    const freshRepository = new PostgresTicketRepository(database);
    const persisted = await freshRepository.get(guildId, created[0].id);
    assert.equal(persisted.id, created[0].id);
    const results = await Promise.all([
      freshRepository.claimTicket(persisted, { userId: 'staff-1', name: 'Staff 1', claimedAt: Date.now(), event: { type: E.CLAIMED, actorUserId: 'staff-1', createdAt: Date.now(), metadata: {} } }),
      freshRepository.claimTicket(persisted, { userId: 'staff-2', name: 'Staff 2', claimedAt: Date.now(), event: { type: E.CLAIMED, actorUserId: 'staff-2', createdAt: Date.now(), metadata: {} } }),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
  } finally {
    await database.pool.query('delete from tickets where guild_id = $1', [guildId]);
    await database.pool.query('delete from ticket_sequences where guild_id = $1', [guildId]);
    await database.close();
  }
});
