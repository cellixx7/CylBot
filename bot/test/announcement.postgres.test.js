require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { drizzle } = require('drizzle-orm/node-postgres');
const { createDatabase } = require('../src/database/client');
const { PostgresAnnouncementRepository } = require('../src/repositories/postgresAnnouncementRepository');

const url = process.env.DATABASE_TEST_URL;
const run = url ? test : test.skip;

run('PostgreSQL persiste categorias de anuncios por guild e sobrevive a nova instância', async () => {
  const database = createDatabase(url);
  const guildId = `announcement-test-${randomUUID()}`;
  const otherGuildId = `announcement-test-${randomUUID()}`;
  try {
    const connection = await database.pool.connect();
    try {
      await connection.query('select pg_advisory_lock(736821)');
      await migrate(drizzle(connection), { migrationsFolder: path.join(__dirname, '../src/database/migrations') });
    } finally { await connection.query('select pg_advisory_unlock(736821)'); connection.release(); }

    const repository = new PostgresAnnouncementRepository(database);
    const categories = [{ id: 'support', name: 'Suporte', title: 'Ajuda', description: 'Padrão', image: '' }];
    await repository.saveCategories(guildId, categories);
    await repository.saveCategories(otherGuildId, [{ id: 'other', name: 'Outro', title: 'Outro', description: '', image: '' }]);
    assert.deepEqual(await repository.getCategories(guildId), categories);
    assert.deepEqual(await new PostgresAnnouncementRepository(database).getCategories(otherGuildId), [{ id: 'other', name: 'Outro', title: 'Outro', description: '', image: '' }]);
    await repository.saveCategories(guildId, [{ ...categories[0], title: 'Ajuda atualizada' }, { id: 'incident', name: 'Incidente', title: 'Incidente', description: '', image: '' }]);
    assert.equal((await repository.getCategories(guildId))[0].title, 'Ajuda atualizada');
  } finally {
    await database.pool.query('delete from announcement_categories where guild_id = any($1::text[])', [[guildId, otherGuildId]]);
    await database.close();
  }
});
