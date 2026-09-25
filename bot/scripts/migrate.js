const { migrate } = require('drizzle-orm/node-postgres/migrator');
const path = require('node:path');
const { getConfig } = require('../src/config/env');
const { createDatabase } = require('../src/database/client');

async function main() {
  const config = getConfig({ requireDiscord: false });
  if (!config.database.url) throw new Error('DATABASE_URL é obrigatória para executar migrations.');
  const database = createDatabase(config.database.url);
  try {
    await migrate(database.db, { migrationsFolder: path.resolve(__dirname, '../src/database/migrations') });
    console.log('Migrations concluídas com sucesso.');
  } finally {
    await database.close();
  }
}

main().catch(error => {
  let cause = error;
  while (cause.cause) cause = cause.cause;
  // Não imprima o erro bruto: ele pode incluir SQL, parâmetros ou credenciais.
  const code = /^[A-Z0-9_]+$/.test(cause.code || '') ? cause.code : undefined;
  console.error(`Falha ao executar migrations${code ? ` (${code})` : ''}.`);
  if (code === '28P01') {
    console.error('Autenticação PostgreSQL recusada. Verifique DATABASE_URL em bot/.env e qual servidor está escutando na porta configurada.');
  }
  process.exitCode = 1;
});
