const { and, arrayOverlaps, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, or, sql } = require('drizzle-orm');
const { ticketEvents, ticketSequences, tickets } = require('../../database/schema');
const { TicketLimitError } = require('../domain/ticketErrors');

const toDate = value => value == null ? null : value instanceof Date ? value : new Date(value);
const millis = value => value instanceof Date ? value.getTime() : value;

function visibleConditions(guildId, { userId, roleIds, admin }) {
  const conditions = [eq(tickets.guildId, guildId)];
  if (!admin) conditions.push(or(eq(tickets.creatorUserId, userId),
    roleIds.length ? arrayOverlaps(tickets.supportRoleIds, roleIds) : undefined));
  return conditions;
}
const statColumns = {
  total: sql`count(*)::int`,
  open: sql`count(*) filter (where ${tickets.status} in ('OPEN', 'CLAIMED', 'REOPENED'))::int`,
  closed: sql`count(*) filter (where ${tickets.status} = 'CLOSED')::int`,
  concluded: sql`count(*) filter (where ${tickets.status} = 'CONCLUDED')::int`,
};
const mapStats = row => ({ total: Number(row?.total) || 0, open: Number(row?.open) || 0,
  closed: Number(row?.closed) || 0, concluded: Number(row?.concluded) || 0 });

function mapEvent(row) {
  return { ticketId: row.ticketId, type: row.type, actorUserId: row.actorUserId, createdAt: millis(row.createdAt), metadata: row.metadata || {} };
}

function mapTicket(row, events) {
  return {
    id: row.id,
    sequence: row.publicNumber,
    publicNumber: row.publicNumber,
    guildId: row.guildId,
    guildName: row.guildName,
    channelId: row.channelId,
    creatorUserId: row.creatorUserId,
    creatorName: row.creatorName,
    assignedUserId: row.assignedUserId,
    assignedName: row.assignedName,
    categoryId: row.categoryId,
    categoryKey: row.categoryKey,
    categoryName: row.categoryName,
    subject: row.subject,
    description: row.description,
    status: row.status,
    createdAt: millis(row.createdAt),
    claimedAt: millis(row.claimedAt),
    closedAt: millis(row.closedAt),
    closeReason: row.closeReason,
    resolutionSummary: row.resolutionSummary,
    reopenCount: row.reopenCount,
    logChannelId: row.logChannelId,
    supportRoleIds: row.supportRoleIds || [],
    initialMessageId: row.initialMessageId,
    openingLogId: row.openingLogId,
    initialized: row.initialized,
    reopenedBy: row.reopenedBy,
    reopenedByName: row.reopenedByName,
    reopenedAt: millis(row.reopenedAt),
    archives: row.archives || [],
    closing: row.closing,
    reopening: row.reopening,
    createdByCycle: row.createdByCycle,
    events: events.map(mapEvent),
  };
}

function valuesFromTicket(ticket) {
  return {
    id: ticket.id,
    publicNumber: ticket.sequence,
    guildId: ticket.guildId,
    guildName: ticket.guildName || null,
    channelId: ticket.channelId || null,
    creatorUserId: ticket.creatorUserId,
    creatorName: ticket.creatorName || null,
    assignedUserId: ticket.assignedUserId || null,
    assignedName: ticket.assignedName || null,
    categoryId: ticket.categoryId || null,
    categoryKey: ticket.categoryKey || ticket.categoryId || null,
    categoryName: ticket.categoryName || null,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    createdAt: toDate(ticket.createdAt),
    claimedAt: toDate(ticket.claimedAt),
    closedAt: toDate(ticket.closedAt),
    closeReason: ticket.closing?.reason || ticket.closeReason || null,
    resolutionSummary: ticket.closing?.summary || ticket.resolutionSummary || null,
    reopenCount: ticket.reopenCount || 0,
    logChannelId: ticket.logChannelId || null,
    supportRoleIds: ticket.supportRoleIds || [],
    initialMessageId: ticket.initialMessageId || null,
    openingLogId: ticket.openingLogId || null,
    initialized: Boolean(ticket.initialized),
    reopenedBy: ticket.reopenedBy || null,
    reopenedByName: ticket.reopenedByName || null,
    reopenedAt: toDate(ticket.reopenedAt),
    archives: ticket.archives || [],
    closing: ticket.closing || null,
    reopening: ticket.reopening || null,
    createdByCycle: ticket.createdByCycle ?? ticket.reopenCount ?? 0,
  };
}

class PostgresTicketRepository {
  constructor(database) { this.database = database; this.db = database.db || database; }

  async getStatsByGuildIds(guildIds) {
    if (!guildIds.length) return new Map();
    const rows = await this.db.select({
      guildId: tickets.guildId,
      ...statColumns,
    }).from(tickets).where(inArray(tickets.guildId, guildIds)).groupBy(tickets.guildId);
    const byGuild = new Map(rows.map(row => [row.guildId, row]));
    return new Map(guildIds.map(id => [id, mapStats(byGuild.get(id))]));
  }

  async getVisibleStats(guildId, access) {
    const [row] = await this.db.select(statColumns).from(tickets).where(and(...visibleConditions(guildId, access)));
    return mapStats(row);
  }

  async readEvents(ticketId, db = this.db) {
    return db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, ticketId)).orderBy(ticketEvents.createdAt);
  }

  async get(guildId, id) {
    const [row] = await this.db.select().from(tickets).where(and(eq(tickets.guildId, guildId), eq(tickets.id, id))).limit(1);
    return row ? mapTicket(row, await this.readEvents(id)) : null;
  }

  async list(guildId) {
    const rows = await this.db.select().from(tickets).where(eq(tickets.guildId, guildId)).orderBy(desc(tickets.createdAt));
    return Promise.all(rows.map(async row => mapTicket(row, await this.readEvents(row.id))));
  }

  // Apply VIEW before pagination, using the support roles saved on each ticket.
  // This read path deliberately avoids loading lifecycle events and transcripts.
  async listVisiblePage(guildId, { userId, roleIds, admin, limit, before, filters = {} }) {
    const conditions = visibleConditions(guildId, { userId, roleIds, admin });
    if (filters.status) conditions.push(eq(tickets.status, filters.status));
    if (filters.category) conditions.push(or(eq(tickets.categoryId, filters.category), eq(tickets.categoryKey, filters.category)));
    if (filters.assigned) conditions.push(filters.assigned === 'unassigned' ? isNull(tickets.assignedUserId)
      : eq(tickets.assignedUserId, filters.assigned === 'me' ? userId : filters.assigned));
    if (filters.from) conditions.push(gte(tickets.createdAt, new Date(filters.from)));
    if (filters.to) conditions.push(lte(tickets.createdAt, new Date(filters.to)));
    if (filters.search) {
      const search = filters.search.replace(/[\\%_]/g, '\\$&');
      const number = /^#?\d{1,10}$/.test(filters.search) ? Number(filters.search.replace(/^#/, '')) : null;
      conditions.push(or(ilike(tickets.subject, `%${search}%`), ilike(tickets.creatorName, `%${search}%`),
        number > 0 && number <= 2147483647 ? eq(tickets.publicNumber, number) : undefined));
    }
    if (before) conditions.push(lt(tickets.publicNumber, before));
    const rows = await this.db.select().from(tickets).where(and(...conditions))
      .orderBy(desc(tickets.publicNumber)).limit(limit + 1);
    const page = rows.slice(0, limit).map(row => mapTicket(row, []));
    return { tickets: page, nextBefore: rows.length > limit ? page.at(-1).publicNumber : null };
  }

  async findByUser(guildId, userId) {
    const rows = await this.db.select().from(tickets).where(and(eq(tickets.guildId, guildId), eq(tickets.creatorUserId, userId))).orderBy(desc(tickets.createdAt));
    return Promise.all(rows.map(async row => mapTicket(row, await this.readEvents(row.id))));
  }

  async findPending(guildId, userId, categoryId) {
    const [row] = await this.db.select().from(tickets).where(and(
      eq(tickets.guildId, guildId), eq(tickets.creatorUserId, userId), eq(tickets.categoryId, categoryId),
      eq(tickets.status, 'OPEN'), eq(tickets.initialized, false),
    )).limit(1);
    return row ? mapTicket(row, await this.readEvents(row.id)) : null;
  }

  async findActiveByUser(guildId, userId, excludeId) {
    const active = or(inArray(tickets.status, ['OPEN', 'CLAIMED', 'REOPENED']), isNotNull(tickets.reopening));
    const conditions = [eq(tickets.guildId, guildId), eq(tickets.creatorUserId, userId), active];
    if (excludeId) conditions.push(sql`${tickets.id} <> ${excludeId}`);
    const rows = await this.db.select().from(tickets).where(and(...conditions)).orderBy(desc(tickets.createdAt));
    return Promise.all(rows.map(async row => mapTicket(row, await this.readEvents(row.id))));
  }

  async findByChannelId(guildId, channelId) {
    const [row] = await this.db.select().from(tickets).where(and(eq(tickets.guildId, guildId), eq(tickets.channelId, channelId))).limit(1);
    return row ? mapTicket(row, await this.readEvents(row.id)) : null;
  }

  async createInTransaction(tx, input, event, { allowAdditional = false } = {}) {
    const active = or(inArray(tickets.status, ['OPEN', 'CLAIMED', 'REOPENED']), isNotNull(tickets.reopening));
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.guildId}:${input.creatorUserId}`}))`);
    const [sameCategory] = await tx.select({ count: sql`count(*)::int` }).from(tickets).where(and(
      eq(tickets.guildId, input.guildId), eq(tickets.creatorUserId, input.creatorUserId), eq(tickets.categoryId, input.categoryId), active,
    ));
    if (!allowAdditional && Number(sameCategory.count) > 0) throw new TicketLimitError('Você já possui um ticket ativo nesta categoria.');
    const [activeTotal] = await tx.select({ count: sql`count(*)::int` }).from(tickets).where(and(
      eq(tickets.guildId, input.guildId), eq(tickets.creatorUserId, input.creatorUserId), active,
    ));
    if (Number(activeTotal.count) >= 3) throw new TicketLimitError('O limite é de três tickets ativos por usuário.');
    const [recent] = await tx.select({ count: sql`count(*)::int` }).from(tickets).where(and(
      eq(tickets.guildId, input.guildId), eq(tickets.creatorUserId, input.creatorUserId),
      sql`(${tickets.createdAt} > now() - interval '60 seconds' OR ${tickets.reopenedAt} > now() - interval '60 seconds')`,
    ));
    if (!allowAdditional && Number(recent.count) > 0) throw new TicketLimitError('Aguarde 60 segundos entre aberturas de tickets.');
    const [sequence] = await tx.insert(ticketSequences).values({ guildId: input.guildId, nextNumber: 1 })
      .onConflictDoUpdate({ target: ticketSequences.guildId, set: { nextNumber: sql`${ticketSequences.nextNumber} + 1` } }).returning({ number: ticketSequences.nextNumber });
    const ticket = { ...input, sequence: sequence.number, id: input.id };
    const [row] = await tx.insert(tickets).values(valuesFromTicket(ticket)).returning();
    if (event) {
      event.ticketId = row.id;
      await tx.insert(ticketEvents).values({ ticketId: row.id, type: event.type, actorUserId: event.actorUserId, metadata: event.metadata || {}, createdAt: toDate(event.createdAt) });
    }
    return mapTicket(row, event ? [event] : []);
  }

  async create(input) {
    return this.db.transaction(async tx => {
      return this.createInTransaction(tx, input, null);
    });
  }

  async createWithEvent(input, event, options) {
    return this.db.transaction(tx => this.createInTransaction(tx, input, event, options));
  }

  async claimTicket(ticket, { userId, name, claimedAt, event }) {
    return this.db.transaction(async tx => {
      const [row] = await tx.update(tickets).set({
        status: 'CLAIMED', assignedUserId: userId, assignedName: name, claimedAt: toDate(claimedAt),
      }).where(and(eq(tickets.guildId, ticket.guildId), eq(tickets.id, ticket.id), isNull(tickets.assignedUserId), inArray(tickets.status, ['OPEN', 'REOPENED']))).returning();
      if (!row) return null;
      const eventRow = { ticketId: row.id, type: event.type, actorUserId: event.actorUserId, metadata: event.metadata || {}, createdAt: toDate(event.createdAt) };
      await tx.insert(ticketEvents).values(eventRow);
      return mapTicket(row, [...(ticket.events || []), eventRow]);
    });
  }

  async beginClose(ticket, closing) {
    const [row] = await this.db.update(tickets).set({ closing })
      .where(and(eq(tickets.guildId, ticket.guildId), eq(tickets.id, ticket.id), isNull(tickets.closing), inArray(tickets.status, ['OPEN', 'CLAIMED', 'REOPENED'])))
      .returning();
    if (!row) return null;
    return mapTicket(row, ticket.events || []);
  }
  async recordToolEvent(event) {
    await this.db.insert(ticketEvents).values({ ticketId: event.ticketId, type: event.type,
      actorUserId: event.actorUserId, metadata: event.metadata, createdAt: toDate(event.createdAt) });
  }

  async closeMissingChannel(ticket, closedAt) {
    return this.db.transaction(async tx => {
      const closing = {
        actorUserId: null, reason: 'Canal removido externamente no Discord.',
        summary: 'Encerrado automaticamente sem transcript porque o canal não existe mais.',
        startedAt: closedAt, completed: true, channelMissing: true, transcriptUnavailable: true,
      };
      const [row] = await tx.update(tickets).set({
        status: 'CLOSED', channelId: null, initialMessageId: null, closedAt: toDate(closedAt),
        closeReason: closing.reason, resolutionSummary: closing.summary, closing, reopening: null,
      }).where(and(
        eq(tickets.guildId, ticket.guildId), eq(tickets.id, ticket.id), eq(tickets.channelId, ticket.channelId),
        eq(tickets.initialized, true), isNull(tickets.closing), isNull(tickets.reopening),
        inArray(tickets.status, ['OPEN', 'CLAIMED', 'REOPENED']),
      )).returning();
      if (!row) return null;
      const eventRow = {
        ticketId: row.id, type: 'TICKET_CLOSED', actorUserId: null,
        metadata: { reason: closing.reason, cycle: row.reopenCount, source: 'discord_channel_missing' },
        createdAt: toDate(closedAt),
      };
      await tx.insert(ticketEvents).values(eventRow);
      return mapTicket(row, [...(ticket.events || []), eventRow]);
    });
  }

  async recoverMissingChannel(ticket, closedAt) {
    if (!ticket.closing && !['CLOSED', 'CONCLUDED'].includes(ticket.status)) return this.closeMissingChannel(ticket, closedAt);
    return this.db.transaction(async tx => {
      if (['CLOSED', 'CONCLUDED'].includes(ticket.status) && ticket.closing?.completed) {
        const [row] = await tx.update(tickets).set({ channelId: null, initialMessageId: null })
          .where(and(eq(tickets.guildId, ticket.guildId), eq(tickets.id, ticket.id), eq(tickets.channelId, ticket.channelId), eq(tickets.status, ticket.status))).returning();
        return row ? mapTicket(row, ticket.events || []) : null;
      }
      const previous = ticket.closing;
      if (!previous) return null;
      const outcome = previous.outcome === 'CONCLUDED' ? 'CONCLUDED' : 'CLOSED';
      const closing = { ...previous, completed: true, channelMissing: true,
        transcriptUnavailable: !previous.transcript, channelLocked: false };
      const reason = closing.reason || 'Canal removido externamente.';
      const archives = [...(ticket.archives || []), { cycle: ticket.reopenCount, channelId: ticket.channelId, closedAt, status: outcome,
        reason, summary: closing.summary || 'Encerrado automaticamente.', transcript: closing.transcript || null,
        transcriptSnapshot: closing.transcriptSnapshot || null, logMessageId: closing.logMessageId || null }];
      const [row] = await tx.update(tickets).set({ status: outcome, channelId: null, initialMessageId: null,
        closedAt: toDate(closedAt), closeReason: reason, resolutionSummary: closing.summary || null,
        closing, archives, reopening: null }).where(and(
          eq(tickets.guildId, ticket.guildId), eq(tickets.id, ticket.id), eq(tickets.channelId, ticket.channelId),
          eq(tickets.initialized, true), isNull(tickets.reopening), inArray(tickets.status, ['OPEN', 'CLAIMED', 'REOPENED']))).returning();
      if (!row) return null;
      const eventRow = { ticketId: row.id, type: outcome === 'CONCLUDED' ? 'TICKET_CONCLUDED' : 'TICKET_CLOSED', actorUserId: closing.actorUserId || null,
        metadata: { reason, cycle: row.reopenCount, source: 'discord_channel_missing' }, createdAt: toDate(closedAt) };
      await tx.insert(ticketEvents).values(eventRow);
      return mapTicket(row, [...(ticket.events || []), eventRow]);
    });
  }

  async save(ticket) {
    return this.db.transaction(async tx => {
      const [row] = await tx.update(tickets).set(valuesFromTicket(ticket)).where(and(eq(tickets.guildId, ticket.guildId), eq(tickets.id, ticket.id))).returning();
      if (!row) throw new Error('Ticket não encontrado no armazenamento.');
      // Moderation events are appended independently; a lifecycle snapshot must never erase them.
      await tx.delete(ticketEvents).where(and(eq(ticketEvents.ticketId, ticket.id), ne(ticketEvents.type, 'TICKET_TOOL')));
      const lifecycleEvents = ticket.events?.filter(event => event.type !== 'TICKET_TOOL') || [];
      if (lifecycleEvents.length) await tx.insert(ticketEvents).values(lifecycleEvents.map(event => ({
        ticketId: ticket.id, type: event.type, actorUserId: event.actorUserId, metadata: event.metadata || {}, createdAt: toDate(event.createdAt),
      })));
      return mapTicket(row, ticket.events || []);
    });
  }
}

module.exports = { PostgresTicketRepository };
