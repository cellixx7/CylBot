const { randomUUID } = require('node:crypto');
const { clientError } = require('../../api/http/errors');
const { logger } = require('../../lib/logger');
const { ACTIVE_STATUSES } = require('./ticketConstants');
const { TICKET_PERMISSION } = require('./ticketPermissionService');
const { MESSAGE_ORIGIN: O, MESSAGE_AUTHOR_TYPE: A, MESSAGE_VISIBILITY: V, DELIVERY_STATUS: D,
  WEB_CONTENT_LIMIT, content, clientMessageId } = require('./ticketMessageContract');

const safeErrorCode = error => typeof error?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : 'DISCORD_ERROR';
const MENTION_TOKEN = /<@!?(\d{17,20})>/g;
const mentionIds = text => [...new Set([...String(text || '').matchAll(MENTION_TOKEN)].map(match => match[1]))];
const safeAvatarUrl = value => typeof value === 'string' && /^https:\/\//.test(value) ? value : null;

class TicketMessageService {
  constructor({ repository, tickets, permissions, adapter }) { Object.assign(this, { repository, tickets, permissions, adapter }); }
  requireStorage() { if (!this.repository) throw clientError(503, 'Mensagens de tickets requerem PostgreSQL e migrations aplicadas.'); }
  active(ticket) {
    if (!ticket.initialized || ticket.closing || ticket.reopening || !ACTIVE_STATUSES.has(ticket.status)) {
      throw clientError(409, 'Este ticket não aceita novas mensagens.');
    }
  }
  authorType(actor, ticket) { return actor.id === ticket.creatorUserId ? A.USER : this.permissions.staff(actor, ticket) ? A.STAFF : null; }
  participantIds(ticket, messages = []) {
    return new Set([ticket.creatorUserId, ticket.assignedUserId,
      ...messages.map(message => message.authorDiscordId)].filter(id => /^[0-9]{17,20}$/.test(id || '')));
  }
  validateWebMentions(ticket, text) {
    const allowed = this.participantIds(ticket);
    if (mentionIds(text).some(id => !allowed.has(id))) throw clientError(400, 'Mencione somente participantes deste ticket.');
  }
  participants(ticket, messages = []) {
    const people = new Map();
    for (const message of messages) {
      if (message.authorDiscordId && (message.authorType === A.USER || message.authorType === A.STAFF)) {
        people.set(message.authorDiscordId, { id: message.authorDiscordId, name: message.authorName, avatarUrl: safeAvatarUrl(message.authorAvatarUrl) });
      }
    }
    for (const id of [ticket.creatorUserId, ticket.assignedUserId].filter(Boolean)) {
      if (!people.has(id)) people.set(id, { id, name: id === ticket.creatorUserId ? 'Criador do ticket' : 'Responsavel pelo ticket', avatarUrl: null });
    }
    return [...people.values()];
  }

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
        authorDiscordId: item.authorId, authorName: item.authorName || authorType, authorAvatarUrl: safeAvatarUrl(item.authorAvatarUrl), authorType,
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
    const actor = await this.permissions.requireAction(TICKET_PERMISSION.RESPOND, input.guildId, input.userId, ticket, ticket);
    const text = content(input.content);
    await this.syncDiscordHistory(ticket, { excludeDiscordMessageId: input.messageId });
    const authorType = this.authorType(actor, ticket);
    const result = await this.repository.create({ ticketId: ticket.id, guildId: ticket.guildId,
      authorDiscordId: actor.id, authorName: actor.name, authorAvatarUrl: safeAvatarUrl(input.authorAvatarUrl) || safeAvatarUrl(actor.avatarUrl), authorType, origin: O.DISCORD, visibility: V.PUBLIC,
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
    this.validateWebMentions(ticket, text);
    await this.syncDiscordHistory(ticket);
    const existing = await this.repository.findByClientMessageId(ticket.id, clientId);
    if (existing) {
      if (existing.authorDiscordId !== actor.id || existing.origin !== O.WEB) throw clientError(409, 'clientMessageId já utilizado.');
      logger.info('ticket.message.duplicate', this.log(ticket, existing));
      return this.deliver(ticket, existing);
    }
    const result = await this.repository.create({
      ticketId: ticket.id, guildId, authorDiscordId: actor.id,
      authorName: actor.name, authorAvatarUrl: safeAvatarUrl(actor.avatarUrl), authorType: this.authorType(actor, ticket), origin: O.WEB, visibility: V.PUBLIC,
      content: text, clientMessageId: clientId, deliveryStatus: D.PENDING
    });
    if (result.duplicate) {
      if (result.message.authorDiscordId !== actor.id || result.message.origin !== O.WEB) throw clientError(409, 'clientMessageId já utilizado.');
      return this.deliver(ticket, result.message);
    }
    logger.info('ticket.message.persisted', this.log(ticket, result.message));
    return this.deliver(ticket, result.message);
  }

  async editWebMessage({
    guildId,
    ticketId,
    messageId,
    userId,
    content: text,
  }) {
    this.requireStorage();

    text = content(
      text,
      WEB_CONTENT_LIMIT,
    );

    const ticket =
      await this.tickets.ticket(
        guildId,
        ticketId,
      );

    this.active(ticket);

    const actor =
      await this.permissions.requireAction(
        TICKET_PERMISSION.RESPOND,
        guildId,
        userId,
        ticket,
        ticket,
      );

    this.validateWebMentions(ticket, text);

    const message =
      await this.repository.findById(
        guildId,
        messageId,
      );

    if (
      !message ||
      message.ticketId !== ticketId
    ) {
      throw clientError(
        404,
        'Mensagem não encontrada neste ticket.',
      );
    }

    if (message.origin !== O.WEB) {
      throw clientError(
        409,
        'Somente mensagens enviadas pela Web podem ser editadas aqui.',
      );
    }

    if (
      message.authorDiscordId !== actor.id
    ) {
      throw clientError(
        403,
        'Você só pode editar suas próprias mensagens.',
      );
    }

    if (message.content === text) {
      return message;
    }

    await this.adapter.editTicketMessage(
      ticket,
      message,
      text,
    );

    const updated =
      await this.repository.editContent({
        guildId,
        ticketId,
        messageId,
        editorDiscordId: actor.id,
        content: text,
      });

    if (!updated) {
      throw clientError(
        404,
        'Mensagem não encontrada.',
      );
    }

    logger.info(
      'ticket.message.edited',
      this.log(
        ticket,
        updated,
      ),
    );

    return updated;
  }

  async updateDiscordMessage({ guildId, channelId, messageId, userId, content: text }) {
    this.requireStorage();
    if (!/^[0-9]{17,20}$/.test(messageId || '')) return null;
    const message = await this.repository.findByDiscordMessageId(guildId, messageId);
    if (!message || message.discordChannelId !== channelId) return null;
    text = content(text, WEB_CONTENT_LIMIT);
    if (message.content === text) return message;
    const updated = await this.repository.editContent({
      guildId,
      ticketId: message.ticketId,
      messageId: message.id,
      editorDiscordId: userId,
      content: text,
    });
    if (updated) logger.info('ticket.message.discord_edited', this.log({ id: message.ticketId, guildId }, updated));
    return updated;
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

  async retryDelivery({
  guildId,
  ticketId,
  messageId,
  userId,
}) {
  this.requireStorage();

  const message =
    await this.repository.findById(
      guildId,
      messageId,
    );

  if (!message) {
    throw clientError(
      404,
      'Mensagem não encontrada.',
    );
  }

  if (
    message.ticketId !== ticketId
  ) {
    throw clientError(
      404,
      'Mensagem não encontrada neste ticket.',
    );
  }

  const ticket =
    await this.tickets.ticket(
      guildId,
      ticketId,
    );

  const actor =
    await this.permissions.requireAction(
      TICKET_PERMISSION.RESPOND,
      guildId,
      userId,
      ticket,
      ticket,
    );

  if (
    message.visibility === V.INTERNAL &&
    !this.permissions.staff(
      actor,
      ticket,
    )
  ) {
    throw clientError(
      403,
      'Somente a equipe pode reenviar esta mensagem.',
    );
  }

  return this.deliver(
    ticket,
    message,
  );
}

  async list({ guildId, ticketId, userId, limit = 50, before }) {
    this.requireStorage();
    const ticket = await this.tickets.ticket(guildId, ticketId);
    const actor = await this.permissions.requireAction(TICKET_PERMISSION.VIEW, guildId, userId, ticket, ticket);
    const visibilities = this.permissions.staff(actor, ticket) ? [V.PUBLIC, V.INTERNAL] : [V.PUBLIC];
    const page = await this.repository.listPage(ticket.id, { limit, before, visibilities });
    const participants = this.participants(ticket, page.messages);
    return { ...page, participants, messages: page.messages.map(message => this.dto(message, userId, participants)) };
  }

  async listRevisions({ guildId, ticketId, messageId, userId }) {
    this.requireStorage();
    const ticket = await this.tickets.ticket(guildId, ticketId);
    const actor = await this.permissions.requireAction(TICKET_PERMISSION.VIEW, guildId, userId, ticket, ticket);
    const message = await this.repository.findById(guildId, messageId);
    if (!message || message.ticketId !== ticketId ||
      (message.visibility !== V.PUBLIC && !this.permissions.staff(actor, ticket))) {
      throw clientError(404, 'Mensagem não encontrada neste ticket.');
    }
    const revisions = await this.repository.listRevisions(messageId);
    return revisions.map(revision => ({
      id: revision.id,
      previousContent: revision.previousContent,
      createdAt: revision.createdAt,
    }));
  }

  async recentForAI(ticket, limit = 12) { this.requireStorage(); return this.repository.listRecent(ticket.id, { limit, visibilities: [V.PUBLIC] }); }
  async forTranscript(ticket, limit = 5000) { this.requireStorage(); return this.repository.listForTranscript(ticket.id, { limit }); }
  dto(message, viewerId, participants = []) { return { id: message.id, authorName: message.authorName, authorAvatarUrl: safeAvatarUrl(message.authorAvatarUrl), authorType: message.authorType, origin: message.origin,
    visibility: message.visibility, content: message.content, deliveryStatus: message.deliveryStatus, createdAt: message.createdAt, editedAt: message.editedAt,
    mentions: mentionIds(message.content).map(id => participants.find(person => person.id === id)).filter(Boolean),
    ...(viewerId ? { isOwn: message.authorDiscordId === viewerId } : {}) }; }
  log(ticket, message) { return { ticketId: ticket.id, guildId: ticket.guildId, messageId: message.id,
    origin: message.origin, deliveryStatus: message.deliveryStatus }; }
}

module.exports = { TicketMessageService };
