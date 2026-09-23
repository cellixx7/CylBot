const { eq } = require('drizzle-orm');
const { users } = require('../database/schema');

class PostgresUserRepository {
  constructor(database) { this.db = database.db || database; }

  async upsertDiscordUser(profile) {
    const now = new Date();
    const [row] = await this.db.insert(users).values({
      discordUserId: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || null,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    }).onConflictDoUpdate({
      target: users.discordUserId,
      set: {
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl || null,
        updatedAt: now,
        lastLoginAt: now,
      },
    }).returning();
    return row;
  }

  async getByDiscordId(discordUserId) {
    const [row] = await this.db.select().from(users).where(eq(users.discordUserId, discordUserId)).limit(1);
    return row || null;
  }
}

module.exports = { PostgresUserRepository };
