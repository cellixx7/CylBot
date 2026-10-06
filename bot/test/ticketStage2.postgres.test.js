require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { createDatabase } = require('../src/database/client');
const { PostgresTicketRepository } = require('../src/Ticket/repositories/postgresTicketRepository');
const { PostgresTicketMessageRepository } = require('../src/Ticket/repositories/postgresTicketMessageRepository');

test('PostgreSQL Etapa 2: filtros combinados antes do cursor, stats por VIEW e anexos/eventos persistentes', { skip: !process.env.DATABASE_TEST_URL }, async () => {
  const database = createDatabase(process.env.DATABASE_TEST_URL);
  const guild = `stage2-${randomUUID()}`; const other = `${guild}-other`;
  try {
    const connection = await database.pool.connect();
    try { await connection.query('select pg_advisory_lock(736821)'); await migrate(drizzle(connection), { migrationsFolder: path.join(__dirname, '../src/database/migrations') }); }
    finally { await connection.query('select pg_advisory_unlock(736821)'); connection.release(); }
    const rows = [];
    for (const [number, status, category, assigned, created, creator, roles, guildId] of [
      [1, 'OPEN', 'support', null, '2026-10-01', 'ana', ['support'], guild],
      [2, 'CLAIMED', 'support', 'staff', '2026-10-03', 'ana', ['support'], guild],
      [3, 'REOPENED', 'billing', null, '2026-10-04', 'ana', ['support'], guild],
      [4, 'CLOSED', 'support', 'staff', '2026-10-04', 'ana', ['support'], guild],
      [5, 'CONCLUDED', 'support', 'staff', '2026-10-05', 'ana', ['support'], guild],
      [6, 'CONCLUDED', 'support', 'staff', '2026-10-05', 'ana', ['private'], guild],
      [7, 'CONCLUDED', 'support', 'staff', '2026-10-05', 'ana', ['support'], other],
    ]) {
      const result = await database.pool.query('insert into tickets (guild_id, public_number, status, category_key, assigned_user_id, created_at, creator_user_id, creator_name, support_role_ids, subject, description, initialized) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true) returning id', [guildId, number, status, category, assigned, created, creator, 'Ana Costa', roles, 'Suporte 50%_garantido', 'Detalhes']);
      rows.push(result.rows[0].id);
    }
    const repository = new PostgresTicketRepository(database);
    const access = { userId: 'staff', roleIds: ['support'], admin: false, limit: 1 };
    const list = async filters => (await repository.listVisiblePage(guild, { ...access, limit: 100, filters })).tickets.map(item => item.publicNumber);
    assert.deepEqual(await list({ status: 'CONCLUDED' }), [5]);
    assert.deepEqual(await list({ category: 'billing' }), [3]);
    assert.deepEqual(await list({ assigned: 'unassigned' }), [3, 1]);
    assert.deepEqual(await list({ assigned: 'me' }), [5, 4, 2]);
    assert.deepEqual(await list({ from: '2026-10-04T00:00:00.000Z', to: '2026-10-05T00:00:00.000Z' }), [5, 4, 3]);
    assert.deepEqual(await list({ status: 'CONCLUDED', category: 'support', assigned: 'me', search: '50%_garantido', from: '2026-10-05T00:00:00.000Z' }), [5]);
    assert.deepEqual(await list({ search: '#4', status: 'CLOSED' }), [4]);
    assert.deepEqual(await list({ search: 'Ana Costa', category: 'billing' }), [3]);
    const page = await repository.listVisiblePage(guild, { ...access, filters: { assigned: 'me' } });
    assert.equal(page.nextBefore, 5);
    const next = await repository.listVisiblePage(guild, { ...access, before: page.nextBefore, filters: { assigned: 'me' } });
    assert.equal(next.tickets[0].publicNumber, 4);
    assert.deepEqual(await repository.getVisibleStats(guild, access), { total: 5, open: 3, closed: 1, concluded: 1 });
    assert.deepEqual(await repository.getVisibleStats(guild, { userId: 'outsider', roleIds: [], admin: false }), { total: 0, open: 0, closed: 0, concluded: 0 });
    const stats = await repository.getStatsByGuildIds([guild, other, 'missing']);
    assert.deepEqual(stats.get(guild), { total: 6, open: 3, closed: 1, concluded: 2 });
    assert.deepEqual(stats.get(other), { total: 1, open: 0, closed: 0, concluded: 1 });
    assert.deepEqual(stats.get('missing'), { total: 0, open: 0, closed: 0, concluded: 0 });
    const messages = new PostgresTicketMessageRepository(database);
    const attachments = [{ name: 'file.pdf', url: 'https://cdn.discordapp.com/attachments/a.pdf', size: 10, contentType: 'application/pdf' }];
    const stored = await messages.create({ ticketId: rows[4], guildId: guild, authorName: 'Ana', authorType: 'USER', origin: 'DISCORD', visibility: 'PUBLIC', content: '[Anexo]', attachments, deliveryStatus: 'SENT' });
    assert.deepEqual((await new PostgresTicketMessageRepository(database).findById(guild, stored.message.id)).attachments, attachments);
    const olderSnapshot = await repository.get(guild, rows[4]);
    await repository.recordToolEvent({ ticketId: rows[4], type: 'TICKET_TOOL', actorUserId: 'staff', createdAt: Date.now(), metadata: { action: 'timeout', result: 'success' } });
    await repository.save(olderSnapshot);
    assert.equal((await repository.get(guild, rows[4])).events[0].type, 'TICKET_TOOL');
    assert.equal((await repository.get(guild, rows[3])).status, 'CLOSED');
  } finally { await database.pool.query('delete from tickets where guild_id = any($1::text[])', [[guild, other]]); await database.close(); }
});
