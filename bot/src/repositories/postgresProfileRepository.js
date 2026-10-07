class PostgresProfileRepository {
  constructor(database) { this.pool = database.pool; }
  async get(userId) {
    const { rows } = await this.pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
    const row = rows[0];
    return row && { bio: row.bio, accent: row.accent, theme: row.theme, visibility: row.visibility, links: row.links };
  }
  async save(userId, profile) {
    await this.pool.query(`INSERT INTO user_profiles (user_id, bio, accent, theme, visibility, links) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id) DO UPDATE SET bio=EXCLUDED.bio, accent=EXCLUDED.accent, theme=EXCLUDED.theme,
        visibility=EXCLUDED.visibility, links=EXCLUDED.links, updated_at=now()`,
      [userId, profile.bio, profile.accent, profile.theme, profile.visibility, JSON.stringify(profile.links)]);
  }
  async badges(userId) {
    const { rows } = await this.pool.query('SELECT badge FROM profile_badges WHERE user_id = $1', [userId]);
    return rows.map(row => row.badge);
  }
  async setBadge(userId, badge, enabled) {
    if (enabled) await this.pool.query('INSERT INTO profile_badges (user_id, badge) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, badge]);
    else await this.pool.query('DELETE FROM profile_badges WHERE user_id=$1 AND badge=$2', [userId, badge]);
  }
}
module.exports = { PostgresProfileRepository };
