const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { getConfig } = require('../src/config/env');
const { createDatabase } = require('../src/database/client');

async function main() {
  const config = getConfig({ requireDiscord: false });
  if (!config.database.url) throw new Error('DATABASE_URL é obrigatória para executar migrations.');
  const database = createDatabase(config.database.url);
  try {
    await migrate(database.db, { migrationsFolder: 'src/database/migrations' });
  } finally {
    await database.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
