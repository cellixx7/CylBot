const { getConfig } = require('../src/config/env');
const { createDatabase } = require('../src/database/client');
const { PostgresPlanRepository } = require('../src/repositories/postgresPlanRepository');
const { snowflake } = require('../src/services/planService');
async function main() {
  const [action, userId, plan, daysText, limitText, ...extra] = process.argv.slice(2);
  const days = Number(daysText), serverLimit = plan === 'COMMUNITY' ? Number(limitText || 1) : 0;
  if (!['grant', 'revoke'].includes(action) || !snowflake(userId) || !['PLUS', 'COMMUNITY'].includes(plan) || extra.length ||
      (action === 'revoke' && (daysText || limitText)) || (action === 'grant' && (!Number.isInteger(days) || days < 1 || days > 3650 ||
      !Number.isInteger(serverLimit) || serverLimit < 0 || serverLimit > 10000 || (plan === 'COMMUNITY' && serverLimit < 1) || (plan === 'PLUS' && limitText)))) {
    throw new Error('Uso: npm --prefix bot run plans -- grant USUARIO PLUS|COMMUNITY DIAS [LIMITE_SERVIDORES] ou revoke USUARIO PLUS|COMMUNITY');
  }
  const config = getConfig({ requireDiscord: false });
  if (!config.database.url) throw new Error('DATABASE_URL é obrigatória para administrar planos.');
  const database = createDatabase(config.database.url);
  try {
    const repository = new PostgresPlanRepository(database);
    if (action === 'grant') await repository.grant({ userId, plan, serverLimit, expiresAt: new Date(Date.now() + days * 86400000) });
    else await repository.revoke(userId, plan);
    console.log(action === 'grant' ? 'Plano registrado com sucesso. Vincule os servidores pelo titular da assinatura.' : 'Plano revogado com sucesso.');
  } finally { await database.close(); }
}
main().catch(error => { console.error(error.message && !error.code ? error.message : 'Não foi possível administrar o plano. Verifique o banco e as migrações.'); process.exitCode = 1; });
