require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { drizzle } = require('drizzle-orm/node-postgres');
const { createDatabase } = require('../src/database/client');
const { PostgresTicketRepository } = require('../src/Ticket/repositories/postgresTicketRepository');
const { TICKET_EVENT: E, TICKET_STATUS: S } = require('../src/Ticket/services/ticketConstants');
const { TicketService } = require('../src/Ticket/services/ticketService');

const url = process.env.DATABASE_TEST_URL;
const run = url ? test : test.skip;

run('PostgreSQL mantém sequência, claim concorrente e primeiro fechamento com checkpoints', async () => {
  const database = createDatabase(url);
  const guildId = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const repository = new PostgresTicketRepository(database);
  const connection = await database.pool.connect();
  try {
    await connection.query('select pg_advisory_lock(736821)');
    await migrate(drizzle(connection), { migrationsFolder: path.join(__dirname, '../src/database/migrations') });
  } finally { await connection.query('select pg_advisory_unlock(736821)'); connection.release(); }
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
    const missingChannel = created[1];
    missingChannel.channelId = 'deleted-channel';
    await freshRepository.save(missingChannel);
    const reconciled = await freshRepository.closeMissingChannel(missingChannel, Date.now());
    assert.equal(reconciled.status, S.CLOSED);
    assert.equal(reconciled.channelId, null);
    assert.equal(reconciled.closing.channelMissing, true);
    assert.equal(reconciled.events.at(-1).metadata.source, 'discord_channel_missing');
    const results = await Promise.all([
      freshRepository.claimTicket(persisted, { userId: 'staff-1', name: 'Staff 1', claimedAt: Date.now(), event: { type: E.CLAIMED, actorUserId: 'staff-1', createdAt: Date.now(), metadata: {} } }),
      freshRepository.claimTicket(persisted, { userId: 'staff-2', name: 'Staff 2', claimedAt: Date.now(), event: { type: E.CLAIMED, actorUserId: 'staff-2', createdAt: Date.now(), metadata: {} } }),
    ]);
    assert.equal(results.filter(Boolean).length, 1);

    // Usa beginClose/save reais; somente Discord e geração do HTML são simulados.
    const claimed = results.find(Boolean);
    claimed.channelId = 'ticket-channel';
    await freshRepository.save(claimed);
    const transcript = { key: 'integration.html', sha256: 'test', lastMessageId: 'last', messageCount: 1 };
    const service = new TicketService({ repository: freshRepository,
      permissions: { requireClose: async () => ({ id: 'staff-1' }) },
      adapter: { publishClosed: async () => 'closed-log', lockChannel: async () => {},
        latestMessageId: async () => 'last', updateInitial: async () => {} },
      transcripts: { generate: async () => transcript, read: () => Buffer.from('test transcript') } });
    const closed = await service.close({ guildId, ticketId: claimed.id, userId: 'staff-1', channelId: claimed.channelId, reason: 'Resolvido' });
    assert.equal(closed.status, S.CLOSED);
    const saved = await new PostgresTicketRepository(database).get(guildId, claimed.id);
    assert.equal(saved.closing.completed, true);
    assert.equal(saved.closing.transcriptPersisted, true);
    assert.equal(saved.closing.channelLocked, true);
    assert.equal(saved.archives.length, 1);
    assert.equal(saved.events.filter(event => event.type === E.CLOSED).length, 1);
  } finally {
    await database.pool.query('delete from tickets where guild_id = $1', [guildId]);
    await database.pool.query('delete from ticket_sequences where guild_id = $1', [guildId]);
    await database.close();
  }
});
