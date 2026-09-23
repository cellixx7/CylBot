const { randomUUID } = require('node:crypto');
const { clientError } = require('../api/http/errors');
const { logger } = require('../lib/logger');
const { ACTIVE_STATUSES } = require('./ticketConstants');
const { TICKET_PERMISSION } = require('./ticketPermissionService');
const { MESSAGE_ORIGIN: O, MESSAGE_AUTHOR_TYPE: A, MESSAGE_VISIBILITY: V, DELIVERY_STATUS: D,
  WEB_CONTENT_LIMIT, content, clientMessageId } = require('./ticketMessageContract');

const safeErrorCode = error => typeof error?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : 'DISCORD_ERROR';

class TicketMessageService {
  constructor({ repository, tickets, permissions, adapter }) { Object.assign(this, { repository, tickets, permissions, adapter }); }
  requireStorage() { if (!this.repository) throw clientError(503, 'Mensagens de tickets requerem PostgreSQL e migrations aplicadas.'); }
  active(ticket) {
    if (!ticket.initialized || ticket.closing || ticket.reopening || !ACTIVE_STATUSES.has(ticket.status)) {
      throw clientError(409, 'Este ticket não aceita novas mensagens.');
    }
  }
  authorType(actor, ticket) { return actor.id === ticket.creatorUserId ? A.USER : this.permissions.staff(actor, ticket) ? A.STAFF : null; }

  async syncDiscordHistory(ticket, { excludeDiscordMessageId } = {}) {
    this.requireStorage();
    if (await this.repository.hasLegacySyncBoundary(ticket.id)) return { imported: 0, skipped: true };
    const history = [];
    let before;
    while (history.length <= 5000) {
      const page = await this.adapter.fetchMessages(ticket.guildId, ticket.channelId, { before, limit: 100 });
      if (!page.length) break;
      history.push(...page);
      if (history.length > 5000) throw clientError(400, 'O histórico legado excede o limite seguro para sincronização.');
      before = page.reduce((oldest, message) => BigInt(message.id) < BigInt(oldest) ? message.id : oldest, page[0].id);
      if (page.length < 100) break;
    }
    history.sort((left, right) => BigInt(left.id) < BigInt(right.id) ? -1 : 1);
    const imports = [];
    for (const item of history) {
      if (item.id === excludeDiscordMessageId) continue;
      const text = String(item.content || item.embeds?.join('\n') || '').trim().slice(0, 2000);
      if (!text) continue;
      const authorType = item.authorId === ticket.creatorUserId ? A.USER : item.authorBot ? A.SYSTEM : A.STAFF;
      imports.push({ ticketId: ticket.id, guildId: ticket.guildId,
        authorDiscordId: item.authorId, authorName: item.authorName || authorType, authorType,
        origin: O.DISCORD, visibility: V.PUBLIC, content: text, discordMessageId: item.id,
        discordChannelId: ticket.channelId, deliveryStatus: D.SENT, deliveryAttempts: 0, createdAt: new Date(item.createdAt) });
    }
    const imported = imports.length ? await this.repository.importMany(imports) : 0;
    logger.info('ticket.message.history_synced', { ticketId: ticket.id, guildId: ticket.guildId, imported });
    return { imported, skipped: false };
  }

  async ingestDiscordMessage(input) {
    this.requireStorage();
    if (!/^[0-9]{17,20}$/.test(input.messageId || '') || typeof this.tickets.repository.findByChannelId !== 'function') return null;
    const ticket = await this.tickets.repository.findByChannelId(input.guildId, input.channelId);
    if (!ticket) return null;
    if (!ticket.initialized || ticket.reopening || !ACTIVE_STATUSES.has(ticket.status)) return null;
    const actor = await this.permissions.requireAction(TICKET_PERMISSION.VIEW, input.guildId, input.userId, ticket, ticket);
    const text = content(input.content);
    await this.syncDiscordHistory(ticket, { excludeDiscordMessageId: input.messageId });
    const authorType = this.authorType(actor, ticket);
    const result = await this.repository.create({ ticketId: ticket.id, guildId: ticket.guildId,
      authorDiscordId: actor.id, authorName: actor.name, authorType, origin: O.DISCORD, visibility: V.PUBLIC,
      content: text, discordMessageId: input.messageId, discordChannelId: input.channelId,
      deliveryStatus: D.SENT, deliveryAttempts: 0, createdAt: input.createdAt ? new Date(input.createdAt) : new Date() });
    logger.info(result.duplicate ? 'ticket.message.duplicate' : 'ticket.message.ingested', this.log(ticket, result.message));
    return { ticket, message: result.message, duplicate: result.duplicate };
  }

  async createWebMessage({ guildId, ticketId, userId, clientMessageId: clientId, content: text }) {
    this.requireStorage();
    clientId = clientMessageId(clientId);
    text = content(text, WEB_CONTENT_LIMIT);
    const ticket = await this.tickets.ticket(guildId, ticketId);
    this.active(ticket);
    const actor = await this.permissions.requireAction(TICKET_PERMISSION.RESPOND, guildId, userId, ticket, ticket);
    await this.syncDiscordHistory(ticket);
    const existing = await this.repository.findByClientMessageId(ticket.id, clientId);
    if (existing) {
      if (existing.authorDiscordId !== actor.id || existing.origin !== O.WEB) throw clientError(409, 'clientMessageId já utilizado.');
      logger.info('ticket.message.duplicate', this.log(ticket, existing));
      return this.deliver(ticket, existing);
    }
    const result = await this.repository.create({ ticketId: ticket.id, guildId, authorDiscordId: actor.id,
      authorName: actor.name, authorType: this.authorType(actor, ticket), origin: O.WEB, visibility: V.PUBLIC,
      content: text, clientMessageId: clientId, deliveryStatus: D.PENDING });
    if (result.duplicate) {
      if (result.message.authorDiscordId !== actor.id || result.message.origin !== O.WEB) throw clientError(409, 'clientMessageId já utilizado.');
      return this.deliver(ticket, result.message);
    }
    logger.info('ticket.message.persisted', this.log(ticket, result.message));
    return this.deliver(ticket, result.message);
  }

  async reserveAIMessage({ ticket, config, proposal, runId, internal = false, db }) {
    this.requireStorage();
    const result = await this.repository.create({ ticketId: ticket.id, guildId: ticket.guildId,
      authorName: config.assistantName || 'CylBot', authorType: A.AI, origin: O.AI,
      visibility: internal ? V.INTERNAL : V.PUBLIC, content: content(proposal.message, 1600),
      clientMessageId: `ai:${runId}`, deliveryStatus: D.PENDING }, db);
    return result.message;
  }

  async createSystemMessage(ticket, { id = randomUUID(), content: text, visibility = V.PUBLIC }) {
    this.requireStorage();
    const result = await this.repository.create({ id, ticketId: ticket.id, guildId: ticket.guildId,
      authorName: 'CylBot', authorType: A.SYSTEM, origin: O.SYSTEM, visibility,
      content: content(text, WEB_CONTENT_LIMIT), deliveryStatus: D.PENDING });
    return this.deliver(ticket, result.message);
  }

  async deliver(ticket, message) {
    if (message.deliveryStatus === D.SENT || message.deliveryStatus === D.NOT_REQUIRED) return message;
    const pending = await this.repository.startDelivery(ticket.guildId, message.id);
    if (!pending) return this.repository.findById(ticket.guildId, message.id);
    logger.info('ticket.message.delivery_started', this.log(ticket, pending));
    try {
      const delivered = await this.adapter.publishTicketMessage(ticket, pending);
      const saved = await this.repository.markDelivered(ticket.guildId, pending.id, pending.deliveryAttempts,
        { discordMessageId: delivered.id, discordChannelId: delivered.channelId })
        || await this.repository.findById(ticket.guildId, pending.id);
      logger.info('ticket.message.delivered', this.log(ticket, saved));
      return saved;
    } catch (error) {
      const failed = await this.repository.markFailed(ticket.guildId, pending.id, pending.deliveryAttempts, safeErrorCode(error))
        || await this.repository.findById(ticket.guildId, pending.id);
      logger.warn('ticket.message.delivery_failed', this.log(ticket, failed));
      return failed;
    }
  }

  async retryDelivery({ guildId, messageId, userId }) {
    this.requireStorage();
    const message = await this.repository.findById(guildId, messageId);
    if (!message) throw clientError(404, 'Mensagem não encontrada.');
    const ticket = await this.tickets.ticket(guildId, message.ticketId);
    const actor = await this.permissions.requireAction(TICKET_PERMISSION.RESPOND, guildId, userId, ticket, ticket);
    if (message.visibility === V.INTERNAL && !this.permissions.staff(actor, ticket)) throw clientError(403, 'Somente a equipe pode reenviar esta mensagem.');
    return this.deliver(ticket, message);
  }

  async list({ guildId, ticketId, userId, limit = 50, before }) {
    this.requireStorage();
    const ticket = await this.tickets.ticket(guildId, ticketId);
    const actor = await this.permissions.requireAction(TICKET_PERMISSION.VIEW, guildId, userId, ticket, ticket);
    const visibilities = this.permissions.staff(actor, ticket) ? [V.PUBLIC, V.INTERNAL, V.SYSTEM] : [V.PUBLIC];
    const page = await this.repository.listPage(ticket.id, { limit, before, visibilities });
    return { ...page, messages: page.messages.map(this.dto) };
  }

  async recentForAI(ticket, limit = 12) { this.requireStorage(); return this.repository.listRecent(ticket.id, { limit, visibilities: [V.PUBLIC] }); }
  async forTranscript(ticket, limit = 5000) { this.requireStorage(); return this.repository.listForTranscript(ticket.id, { limit }); }
  dto(message) { return { id: message.id, authorName: message.authorName, authorType: message.authorType, origin: message.origin,
    visibility: message.visibility, content: message.content, deliveryStatus: message.deliveryStatus, createdAt: message.createdAt, editedAt: message.editedAt }; }
  log(ticket, message) { return { ticketId: ticket.id, guildId: ticket.guildId, messageId: message.id,
    origin: message.origin, deliveryStatus: message.deliveryStatus }; }
}

module.exports = { TicketMessageService };
