require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { drizzle } = require('drizzle-orm/node-postgres');
const { createDatabase } = require('../src/database/client');
const { PostgresTicketMessageRepository } = require('../src/Ticket/repositories/postgresTicketMessageRepository');

const url = process.env.DATABASE_TEST_URL;
const run = url ? test : test.skip;

run('PostgreSQL Message Core preserva idempotência, paginação, delivery, restart e constraints', async () => {
  const database = createDatabase(url);
  const guildId = `message-test-${randomUUID()}`;
  const ticketId = randomUUID();
  try {
    const connection = await database.pool.connect();
    try {
      await connection.query('select pg_advisory_lock(736821)');
      await migrate(drizzle(connection), { migrationsFolder: path.join(__dirname, '../src/database/migrations') });
    } finally { await connection.query('select pg_advisory_unlock(736821)'); connection.release(); }
    await database.pool.query("insert into tickets (id,guild_id,public_number,subject,description,status,initialized) values ($1,$2,1,'Test','Test','OPEN',true)", [ticketId, guildId]);
    const repository = new PostgresTicketMessageRepository(database);
    const base = { ticketId, guildId, authorDiscordId: 'user', authorName: 'User', authorType: 'USER',
      visibility: 'PUBLIC', content: 'Mensagem', deliveryStatus: 'PENDING' };
    const first = await repository.create({ ...base, origin: 'WEB', clientMessageId: 'client-message-1', createdAt: new Date('2026-01-01T00:00:00Z') });
    const duplicate = await repository.create({ ...base, origin: 'WEB', clientMessageId: 'client-message-1' });
    assert.equal(duplicate.duplicate, true); assert.equal(duplicate.message.id, first.message.id);
    const discord = await repository.create({ ...base, origin: 'DISCORD', deliveryStatus: 'SENT', discordMessageId: 'discord-1',
      discordChannelId: 'channel', createdAt: new Date('2026-01-02T00:00:00Z') });
    const duplicateDiscord = await repository.create({ ...base, origin: 'DISCORD', deliveryStatus: 'SENT', discordMessageId: 'discord-1' });
    assert.equal(duplicateDiscord.message.id, discord.message.id);
    await repository.create({ ...base, origin: 'WEB', clientMessageId: 'client-message-2', createdAt: new Date('2026-01-03T00:00:00Z') });
    const page = await repository.listPage(ticketId, { limit: 2, visibilities: ['PUBLIC'] });
    assert.equal(page.messages.length, 2); assert(page.nextBefore);
    const older = await repository.listPage(ticketId, { limit: 2, before: page.nextBefore, visibilities: ['PUBLIC'] });
    assert.equal(older.messages.length, 1);
    const firstAttempt = await repository.startDelivery(guildId, first.message.id); assert(firstAttempt);
    assert.equal((await repository.markFailed(guildId, first.message.id, firstAttempt.deliveryAttempts, 'DISCORD_DOWN')).deliveryStatus, 'FAILED');
    const secondAttempt = await repository.startDelivery(guildId, first.message.id); assert(secondAttempt);
    const delivered = await repository.markDelivered(guildId, first.message.id, secondAttempt.deliveryAttempts,
      { discordMessageId: 'discord-2', discordChannelId: 'channel' });
    assert.equal(delivered.deliveryAttempts, 2); assert.equal(delivered.deliveryStatus, 'SENT');
    const stale = await repository.create({ ...base, origin: 'WEB', clientMessageId: 'client-message-stale',
      deliveryStatus: 'SENDING', deliveryAttempts: 1, updatedAt: new Date(Date.now() - 61000) });
    const recovered = await repository.startDelivery(guildId, stale.message.id);
    assert.equal(recovered.deliveryAttempts, 2);
    assert.equal((await repository.markDelivered(guildId, stale.message.id, recovered.deliveryAttempts,
      { discordMessageId: 'discord-stale', discordChannelId: 'channel' })).deliveryStatus, 'SENT');
    assert.equal(await repository.markFailed(guildId, stale.message.id, 1, 'OLD_FAILURE'), undefined);
    const restarted = new PostgresTicketMessageRepository(database);
    assert.equal((await restarted.findByClientMessageId(ticketId, 'client-message-1')).id, first.message.id);
    await assert.rejects(repository.create({ ...base, origin: 'WEB', clientMessageId: 'too-long-content', content: 'x'.repeat(2001) }));
  } finally {
    await database.pool.query('delete from tickets where guild_id=$1', [guildId]);
    await database.close();
  }
});
