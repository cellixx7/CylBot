const { asc, eq } = require('drizzle-orm');
const { announcementCategories, announcementPublications } = require('../database/schema');
const { desc } = require('drizzle-orm');

const mapCategory = row => ({
  id: row.id,
  name: row.name,
  title: row.title,
  description: row.description || '',
  image: row.image || '',
});

class PostgresAnnouncementRepository {
  constructor(database) { this.db = database.db || database; }

  async getCategories(guildId) {
    const rows = await this.db.select().from(announcementCategories)
      .where(eq(announcementCategories.guildId, guildId))
      .orderBy(asc(announcementCategories.createdAt), asc(announcementCategories.id));
    return rows.length ? rows.map(mapCategory) : undefined;
  }

  async saveCategories(guildId, categories) {
    return this.db.transaction(async tx => {
      await tx.delete(announcementCategories).where(eq(announcementCategories.guildId, guildId));
      if (!categories.length) return;
      const now = Date.now();
      await tx.insert(announcementCategories).values(categories.map((category, index) => ({
        guildId,
        id: category.id,
        name: category.name,
        title: category.title,
        description: category.description || '',
        image: category.image || '',
        createdAt: new Date(now + index),
        updatedAt: new Date(now + index),
      })));
    });
  }

  async getRecent(guildId, limit = 12) {
    const rows = await this.db.select().from(announcementPublications)
      .where(eq(announcementPublications.guildId, guildId))
      .orderBy(desc(announcementPublications.createdAt)).limit(limit);
    return rows.map(row => ({ ...row, publishedAt: row.createdAt?.toISOString?.() || row.createdAt }));
  }

  async savePublication(publication) {
    const [row] = await this.db.insert(announcementPublications).values({
      guildId: publication.guildId, type: publication.type, title: publication.title, content: publication.content,
      channelId: publication.channelId, channelName: publication.channelName || null,
      communityVisible: Boolean(publication.communityVisible), publishedBy: publication.publishedBy,
    }).returning();
    return { ...row, publishedAt: row.createdAt?.toISOString?.() || row.createdAt };
  }
}

module.exports = { PostgresAnnouncementRepository };
