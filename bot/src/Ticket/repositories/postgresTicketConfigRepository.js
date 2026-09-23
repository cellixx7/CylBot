const { and, eq } = require('drizzle-orm');
const { ticketConfigs, ticketCategories } = require('../../database/schema');

const dateValue = value => value instanceof Date ? value.getTime() : value;

function fromRows(config, categories) {
  if (!config) return null;
  return {
    guildId: config.guildId,
    setupId: config.setupId,
    mode: config.mode,
    supportRoleIds: config.supportRoleIds || [],
    categories: categories.map(category => ({ id: category.key, name: category.name, description: category.description, emoji: category.emoji || undefined, enabled: category.enabled })),
    panelChannelId: config.panelChannelId,
    logChannelId: config.logChannelId,
    activeCategoryId: config.activeCategoryId,
    publicCategoryId: config.publicCategoryId,
    panelMessageId: config.panelMessageId,
    ready: config.ready,
    createdBy: config.createdBy,
    createdAt: dateValue(config.createdAt),
    updatedAt: dateValue(config.updatedAt),
  };
}

class PostgresTicketConfigRepository {
  constructor(database) { this.db = database.db || database; }

  async get(guildId) {
    const [config] = await this.db.select().from(ticketConfigs).where(eq(ticketConfigs.guildId, guildId)).limit(1);
    if (!config) return null;
    const categories = await this.db.select().from(ticketCategories).where(eq(ticketCategories.guildId, guildId));
    return fromRows(config, categories);
  }

  async save(config) {
    return this.db.transaction(async tx => {
      const now = new Date();
      const [row] = await tx.insert(ticketConfigs).values({
      guildId: config.guildId,
      setupId: config.setupId || null,
      mode: config.mode || null,
      panelChannelId: config.panelChannelId || null,
      logChannelId: config.logChannelId || null,
      activeCategoryId: config.activeCategoryId || null,
      publicCategoryId: config.publicCategoryId || null,
      panelMessageId: config.panelMessageId || null,
      supportRoleIds: config.supportRoleIds || [],
      ready: Boolean(config.ready),
      createdBy: config.createdBy || null,
      createdAt: config.createdAt ? new Date(config.createdAt) : now,
      updatedAt: now,
      }).onConflictDoUpdate({
      target: ticketConfigs.guildId,
      set: {
        setupId: config.setupId || null,
        mode: config.mode || null,
        panelChannelId: config.panelChannelId || null,
        logChannelId: config.logChannelId || null,
        activeCategoryId: config.activeCategoryId || null,
        publicCategoryId: config.publicCategoryId || null,
        panelMessageId: config.panelMessageId || null,
        supportRoleIds: config.supportRoleIds || [],
        ready: Boolean(config.ready),
        createdBy: config.createdBy || null,
        updatedAt: now,
      },
      }).returning();
      await tx.delete(ticketCategories).where(eq(ticketCategories.guildId, config.guildId));
      if (config.categories?.length) {
        await tx.insert(ticketCategories).values(config.categories.map(category => ({
        guildId: config.guildId,
        key: category.id,
        name: category.name,
        description: category.description || '',
        emoji: category.emoji || null,
        enabled: category.enabled !== false,
        })));
      }
      return fromRows(row, config.categories || []);
    });
  }
}

module.exports = { PostgresTicketConfigRepository };
