const { codedClientError } = require('../api/http/errors');
const { communityRequired } = require('../services/planService');
const map = row => row && ({ id: row.id, userId: row.user_id, plan: row.plan, status: row.status,
  expiresAt: row.expires_at.toISOString(), serverLimit: row.server_limit, guildIds: row.guild_ids || [] });
class PostgresPlanRepository {
  constructor(database) { this.pool = database.pool; }
  async forUser(userId) {
    const result = await this.pool.query(`SELECT s.*, COALESCE(array_agg(g.guild_id) FILTER (WHERE g.guild_id IS NOT NULL), '{}') AS guild_ids
      FROM plan_subscriptions s LEFT JOIN plan_guilds g ON g.subscription_id = s.id WHERE s.user_id = $1 GROUP BY s.id`, [userId]);
    return result.rows.map(map);
  }
  async forGuild(guildId) {
    const result = await this.pool.query(`SELECT s.* FROM plan_subscriptions s JOIN plan_guilds g ON g.subscription_id = s.id WHERE g.guild_id = $1`, [guildId]);
    return map(result.rows[0]);
  }
  async activate(userId, guildId) {
    const connection = await this.pool.connect();
    try {
      await connection.query('BEGIN');
      const { rows } = await connection.query(`SELECT * FROM plan_subscriptions WHERE user_id = $1 AND plan = 'COMMUNITY' FOR UPDATE`, [userId]);
      const subscription = rows[0];
      if (!subscription || subscription.status !== 'ACTIVE' || subscription.expires_at.getTime() <= Date.now()) throw communityRequired();
      const existing = await connection.query('SELECT subscription_id FROM plan_guilds WHERE guild_id = $1', [guildId]);
      if (existing.rows.length && existing.rows[0].subscription_id !== subscription.id) throw codedClientError(409, 'GUILD_PLAN_ALREADY_LINKED', 'Este servidor já está vinculado a outra assinatura.');
      if (!existing.rows.length) {
        const count = await connection.query('SELECT count(*)::int AS total FROM plan_guilds WHERE subscription_id = $1', [subscription.id]);
        if (count.rows[0].total >= subscription.server_limit) throw codedClientError(403, 'COMMUNITY_SERVER_LIMIT', 'Sua assinatura atingiu o limite de servidores habilitados.');
        try { await connection.query('INSERT INTO plan_guilds (guild_id, subscription_id) VALUES ($1, $2)', [guildId, subscription.id]); }
        catch (error) { if (error.code === '23505') throw codedClientError(409, 'GUILD_PLAN_ALREADY_LINKED', 'Este servidor já está vinculado a outra assinatura.'); throw error; }
      }
      await connection.query('COMMIT');
      return { guildId, plan: 'COMMUNITY', active: true };
    } catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
  }
  async deactivate(userId, guildId) {
    const result = await this.pool.query(`DELETE FROM plan_guilds g USING plan_subscriptions s WHERE g.subscription_id = s.id AND g.guild_id = $1 AND s.user_id = $2 RETURNING g.guild_id`, [guildId, userId]);
    if (!result.rows.length) throw codedClientError(403, 'PLAN_OWNER_REQUIRED', 'Somente o titular da assinatura pode desvincular este servidor.');
    return { guildId, active: false };
  }
  // Somente operação local confiável; não existe endpoint público para conceder planos.
  async grant({ userId, plan, expiresAt, serverLimit }) {
    const connection = await this.pool.connect();
    try {
      await connection.query('BEGIN');
      const current = await connection.query('SELECT id FROM plan_subscriptions WHERE user_id = $1 AND plan = $2 FOR UPDATE', [userId, plan]);
      if (current.rows.length) {
        const count = await connection.query('SELECT count(*)::int AS total FROM plan_guilds WHERE subscription_id = $1', [current.rows[0].id]);
        if (count.rows[0].total > serverLimit) throw codedClientError(409, 'COMMUNITY_SERVER_LIMIT', 'Desvincule servidores antes de reduzir o limite da assinatura.');
      }
      await connection.query(`INSERT INTO plan_subscriptions (user_id, plan, expires_at, server_limit) VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, plan) DO UPDATE SET status = 'ACTIVE', expires_at = EXCLUDED.expires_at, server_limit = EXCLUDED.server_limit`, [userId, plan, expiresAt, serverLimit]);
      await connection.query('COMMIT');
    } catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
  }
  async revoke(userId, plan) {
    await this.pool.query(`UPDATE plan_subscriptions SET status = 'REVOKED' WHERE user_id = $1 AND plan = $2`, [userId, plan]);
  }
}
module.exports = { PostgresPlanRepository };
