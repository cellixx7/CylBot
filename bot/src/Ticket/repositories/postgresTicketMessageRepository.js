const { and, asc, desc, eq, inArray, lt, or, sql } = require('drizzle-orm');
const {
  ticketMessages,
  ticketMessageRevisions,
} = require('../../database/schema');

const millis = value => value instanceof Date ? value.getTime() : value;
const map = row => row && ({ ...row, createdAt: millis(row.createdAt), updatedAt: millis(row.updatedAt), editedAt: millis(row.editedAt) });

class PostgresTicketMessageRepository {
  constructor(database) { this.db = database.db || database; }

  async create(values, db = this.db) {
    const rows = await db.insert(ticketMessages).values(values).onConflictDoNothing().returning();
    if (rows[0]) return { message: map(rows[0]), duplicate: false };
    const existing = values.clientMessageId
      ? await this.findByClientMessageId(values.ticketId, values.clientMessageId, db)
      : values.discordMessageId ? await this.findByDiscordMessageId(values.guildId, values.discordMessageId, db)
        : values.id ? await this.findById(values.guildId, values.id, db) : null;
    if (!existing) throw new Error('Conflito ao persistir mensagem do ticket.');
    return { message: existing, duplicate: true };
  }

  async findById(guildId, id, db = this.db) {
    const [row] = await db.select().from(ticketMessages).where(and(eq(ticketMessages.guildId, guildId), eq(ticketMessages.id, id))).limit(1);
    return map(row);
  }

  async findByIdForTicket(ticketId, id, db = this.db) {
    const [row] = await db.select().from(ticketMessages).where(and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.id, id))).limit(1);
    return map(row);
  }

  async findByClientMessageId(ticketId, value, db = this.db) {
    const [row] = await db.select().from(ticketMessages).where(and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.clientMessageId, value))).limit(1);
    return map(row);
  }

  async findByDiscordMessageId(guildId, value, db = this.db) {
    const [row] = await db.select().from(ticketMessages).where(and(eq(ticketMessages.guildId, guildId), eq(ticketMessages.discordMessageId, value))).limit(1);
    return map(row);
  }

  async editContent({
  guildId,
  ticketId,
  messageId,
  editorDiscordId,
  content,
}) {
  return this.db.transaction(async tx => {
    const current = await this.findByIdForTicket(
      ticketId,
      messageId,
      tx,
    );

    if (
      !current ||
      current.guildId !== guildId
    ) {
      return null;
    }

    if (current.content === content) {
      return current;
    }

    const now = new Date();

    await tx
      .insert(ticketMessageRevisions)
      .values({
        messageId,
        editorDiscordId,
        previousContent: current.content,
        createdAt: now,
      });

    const [updated] = await tx
      .update(ticketMessages)
      .set({
        content,
        editedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(ticketMessages.guildId, guildId),
          eq(ticketMessages.ticketId, ticketId),
          eq(ticketMessages.id, messageId),
        ),
      )
      .returning();

    return map(updated);
  });
  }

  async listRevisions(
    messageId,
    db = this.db,
  ) {
    const rows = await db
      .select()
      .from(ticketMessageRevisions)
      .where(
        eq(
          ticketMessageRevisions.messageId,
          messageId,
        ),
      )
      .orderBy(
        desc(
          ticketMessageRevisions.createdAt,
        ),
      );

    return rows.map(row => ({
      ...row,
      createdAt: millis(row.createdAt),
    }));
  }

  async hasLegacySyncBoundary(ticketId, db = this.db) {
    const [row] = await db.select({ id: ticketMessages.id }).from(ticketMessages)
      .where(and(eq(ticketMessages.ticketId, ticketId), inArray(ticketMessages.origin, ['DISCORD', 'WEB']))).limit(1);
    return Boolean(row);
  }

  async importMany(values, db = this.db) {
    let imported = 0;
    for (let offset = 0; offset < values.length; offset += 100) {
      const rows = await db.insert(ticketMessages).values(values.slice(offset, offset + 100)).onConflictDoNothing().returning({ id: ticketMessages.id });
      imported += rows.length;
    }
    return imported;
  }

  async listRecent(ticketId, { limit = 12, visibilities = ['PUBLIC'] } = {}, db = this.db) {
    const rows = await db.select().from(ticketMessages).where(and(eq(ticketMessages.ticketId, ticketId), inArray(ticketMessages.visibility, visibilities)))
      .orderBy(desc(ticketMessages.createdAt), desc(ticketMessages.id)).limit(limit);
    return rows.reverse().map(map);
  }

  async listPage(ticketId, { limit = 50, before, visibilities = ['PUBLIC'] } = {}, db = this.db) {
    let cursor;
    if (before) cursor = await this.findByIdForTicket(ticketId, before, db);
    const conditions = [eq(ticketMessages.ticketId, ticketId), inArray(ticketMessages.visibility, visibilities)];
    if (cursor) conditions.push(or(lt(ticketMessages.createdAt, new Date(cursor.createdAt)),
      and(eq(ticketMessages.createdAt, new Date(cursor.createdAt)), lt(ticketMessages.id, cursor.id))));
    const rows = await db.select().from(ticketMessages).where(and(...conditions))
      .orderBy(desc(ticketMessages.createdAt), desc(ticketMessages.id)).limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse().map(map);
    return { messages: page, nextBefore: hasMore ? page[0]?.id || null : null };
  }

  async listForTranscript(ticketId, { limit = 5000 } = {}, db = this.db) {
    const rows = await db.select().from(ticketMessages).where(and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.visibility, 'PUBLIC')))
      .orderBy(asc(ticketMessages.createdAt), asc(ticketMessages.id)).limit(limit + 1);
    return rows.map(map);
  }

  async startDelivery(guildId, id) {
    const retryBefore = new Date(Date.now() - 60_000);
    const [row] = await this.db.update(ticketMessages).set({
      deliveryStatus: 'SENDING',
      deliveryAttempts: sql`${ticketMessages.deliveryAttempts} + 1`, deliveryErrorCode: null, updatedAt: new Date()
    })
      .where(and(eq(ticketMessages.guildId, guildId), eq(ticketMessages.id, id), or(
        inArray(ticketMessages.deliveryStatus, ['PENDING', 'FAILED']),
        and(eq(ticketMessages.deliveryStatus, 'SENDING'), lt(ticketMessages.updatedAt, retryBefore)),
      ))).returning();
    return map(row);
  }

  async markDelivered(guildId, id, attempt, { discordMessageId, discordChannelId }) {
    const [row] = await this.db.update(ticketMessages).set({
      deliveryStatus: 'SENT', discordMessageId, discordChannelId,
      deliveryErrorCode: null, updatedAt: new Date()
    }).where(and(eq(ticketMessages.guildId, guildId), eq(ticketMessages.id, id),
      eq(ticketMessages.deliveryStatus, 'SENDING'), eq(ticketMessages.deliveryAttempts, attempt))).returning();
    return map(row);
  }

  async markFailed(guildId, id, attempt, code) {
    const [row] = await this.db.update(ticketMessages).set({
      deliveryStatus: 'FAILED', deliveryErrorCode: code || 'DISCORD_ERROR',
      updatedAt: new Date()
    }).where(and(eq(ticketMessages.guildId, guildId), eq(ticketMessages.id, id),
      eq(ticketMessages.deliveryStatus, 'SENDING'), eq(ticketMessages.deliveryAttempts, attempt))).returning();
    return map(row);
  }
}

module.exports = { PostgresTicketMessageRepository };
