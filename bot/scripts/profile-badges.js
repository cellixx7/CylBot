const { getConfig } = require('../src/config/env');
const { createDatabase } = require('../src/database/client');
const { PostgresProfileRepository } = require('../src/repositories/postgresProfileRepository');
const { snowflake } = require('../src/services/planService');
async function main() {
  const [action, userId, badge, ...extra] = process.argv.slice(2);
  if (!['grant','revoke'].includes(action) || !snowflake(userId) || !['PARTNER','CREATOR','STAFF'].includes(badge) || extra.length) throw new Error('Uso: npm --prefix bot run profile:badges -- grant|revoke ID_USUARIO PARTNER|CREATOR|STAFF');
  const config = getConfig({ requireDiscord: false });
  if (!config.database.url) throw new Error('DATABASE_URL é obrigatória para administrar selos.');
  const database = createDatabase(config.database.url);
  try { await new PostgresProfileRepository(database).setBadge(userId, badge, action === 'grant'); console.log('Selo oficial atualizado.'); }
  finally { await database.close(); }
}
main().catch(error => { console.error(error.code ? 'Não foi possível atualizar o selo. Verifique o banco.' : error.message); process.exitCode = 1; });
