const { clientError } = require('../api/http/errors');
const { logger } = require('../lib/logger');
const { TICKET_STATUS: S, TICKET_EVENT: E, ACTIVE_STATUSES } = require('./ticketConstants');
const { TicketAlreadyClaimedError, TicketNotFoundError, assertActiveState, transition } = require('./ticketDomain');
const { TICKET_PERMISSION } = require('./ticketPermissionService');

const requiredText = (value, max, required = true) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw clientError(400, `Preencha o campo respeitando o limite de ${max} caracteres.`);
  return value.trim();
};

class TicketService {
  constructor({ repository, configs, permissions, adapter, transcripts, reconciliation, now = Date.now }) {
    Object.assign(this, { repository, configs, permissions, adapter, transcripts, reconciliation, now });
    this.busy = new Set();
  }
  async exclusive(guildId, operation) {
    if (this.busy.has(guildId)) throw clientError(409, 'Há uma operação de tickets em andamento. Aguarde e tente novamente.');
    this.busy.add(guildId);
    try { return await operation(); } finally { this.busy.delete(guildId); }
  }
  async config(guildId) {
    const config = await this.configs.get(guildId);
    if (!config?.ready) throw clientError(400, 'Sistema de tickets ainda não configurado.');
    if (this.reconciliation) await this.reconciliation.assertConfig(config);
    return config;
  }
  assertTicket(guildId, ticketId, ticket) {
    if (!ticket || ticket.guildId !== guildId) throw new TicketNotFoundError();
    return ticket;
  }
  ticket(guildId, ticketId) {
    const result = this.repository.get(guildId, ticketId);
    return result && typeof result.then === 'function'
      ? result.then(ticket => this.assertTicket(guildId, ticketId, ticket))
      : this.assertTicket(guildId, ticketId, result);
  }
  channel(ticket, channelId, log = false) {
    if (!channelId || channelId !== (log ? ticket.logChannelId : ticket.channelId)) throw clientError(403, 'Use o controle no canal correspondente a este ticket.');
  }
  event(ticket, type, userId, metadata = {}) {
    ticket.events.push({ type, ticketId: ticket.id, actorUserId: userId, createdAt: this.now(), metadata });
  }
  async limits(guildId, userId, categoryId, excludeId) {
    const tickets = this.repository.findByUser
      ? await this.repository.findByUser(guildId, userId)
      : (await this.repository.list(guildId)).filter(ticket => ticket.creatorUserId === userId);
    const active = this.repository.findActiveByUser
      ? await this.repository.findActiveByUser(guildId, userId, excludeId)
      : tickets.filter(ticket => ticket.id !== excludeId && (ACTIVE_STATUSES.has(ticket.status) || ticket.reopening));
    if (active.some(ticket => ticket.categoryId === categoryId)) throw clientError(409, 'Você já possui um ticket ativo nesta categoria.');
    if (active.length >= 3) throw clientError(429, 'O limite é de três tickets ativos por usuário.');
    if (tickets.some(ticket => this.now() - (ticket.reopenedAt || ticket.createdAt) < 60_000)) throw clientError(429, 'Aguarde 60 segundos entre aberturas de tickets.');
  }
  async categories({ guildId, userId, channelId }) {
    await this.permissions.actor(guildId, userId);
    const config = await this.config(guildId);
    if (channelId !== config.panelChannelId) throw clientError(403, 'Use o painel oficial de tickets.');
    return config.categories;
  }
  async create({ guildId, userId, channelId, categoryId, subject, description }) {
    return this.exclusive(guildId, async () => {
      const actor = await this.permissions.actor(guildId, userId);
      const config = await this.config(guildId);
      if (channelId !== config.panelChannelId) throw clientError(403, 'Use o painel oficial de tickets.');
      const category = config.categories.find(item => item.id === categoryId);
      if (!category) throw clientError(400, 'Categoria de ticket inválida.');
      subject = requiredText(subject, 100); description = requiredText(description, 2000);
      let ticket = this.repository.findPending
        ? await this.repository.findPending(guildId, userId, categoryId)
        : (await this.repository.list(guildId)).find(item => item.creatorUserId === userId && item.categoryId === categoryId && !item.initialized && item.status === S.OPEN);
      if (!ticket) {
        await this.limits(guildId, userId, categoryId);
        await this.adapter.validateStructure(config);
        const ticketInput = { guildId, guildName: await this.adapter.guildName(guildId),
          creatorUserId: userId, creatorName: actor.name, categoryId, categoryName: category.name,
          subject, description, status: S.OPEN, assignedUserId: null, assignedName: null,
          createdAt: this.now(), claimedAt: null, closedAt: null, reopenCount: 0,
          channelId: null, initialMessageId: null, openingLogId: null, logChannelId: config.logChannelId,
          supportRoleIds: [...config.supportRoleIds], initialized: false, events: [], archives: [], closing: null, reopening: null,
        };
        const createdEvent = { type: E.CREATED, ticketId: null, actorUserId: userId, createdAt: this.now(), metadata: {} };
        ticket = this.repository.createWithEvent
          ? await this.repository.createWithEvent(ticketInput, createdEvent)
          : await this.repository.create(ticketInput);
      } else if (this.reconciliation) {
        await this.reconciliation.assertTicketChannel(ticket);
      }
      if (!ticket.channelId) {
        ticket.channelId = await this.adapter.createTicketChannel(ticket, config);
        await this.repository.save(ticket);
      }
      if (!ticket.initialMessageId) {
        ticket.initialMessageId = await this.adapter.publishInitial(ticket);
        await this.repository.save(ticket);
      }
      if (!ticket.openingLogId) {
        ticket.openingLogId = await this.adapter.publishOpened(ticket);
        await this.repository.save(ticket);
      }
      ticket.initialized = true;
      if (!this.repository.createWithEvent) this.event(ticket, E.CREATED, userId);
      await this.repository.save(ticket);
      logger.info('ticket.created', { guildId, ticketId: ticket.id, userId, channelId: ticket.channelId });
      return ticket;
    });
  }
  async claim({ guildId, userId, ticketId, channelId }) {
    return this.exclusive(guildId, async () => {
      let ticket = await this.ticket(guildId, ticketId);
      this.channel(ticket, channelId);
      const actor = await this.permissions.requireAction(TICKET_PERMISSION.CLAIM, guildId, userId, ticket, ticket);
      if (ticket.closing || ticket.reopening || !ticket.initialized || !ACTIVE_STATUSES.has(ticket.status)) throw clientError(409, 'Este ticket não está disponível para atendimento.');
      if (ticket.assignedUserId) throw new TicketAlreadyClaimedError(ticket.assignedName, ticket.assignedUserId);
      if (this.repository.claimTicket) {
        ticket = await this.repository.claimTicket(ticket, { userId, name: actor.name, claimedAt: this.now(),
          event: { type: E.CLAIMED, actorUserId: userId, createdAt: this.now(), metadata: {} } });
        if (!ticket) throw clientError(409, 'Este ticket já está sendo atendido por outro membro da equipe.');
      } else {
        transition(ticket, S.CLAIMED); ticket.assignedUserId = userId; ticket.assignedName = actor.name; ticket.claimedAt = this.now();
        this.event(ticket, E.CLAIMED, userId);
        await this.repository.save(ticket);
      }
      // Falha visual não desfaz a atribuição persistida nem permite outro atendente assumir.
      try { await this.adapter.updateInitial(ticket); } catch { logger.warn('ticket.message_update_failed', { guildId, ticketId, channelId }); }
      logger.info('ticket.claimed', { guildId, ticketId, staffUserId: userId, channelId });
      return ticket;
    });
  }
  async canClose({ guildId, userId, ticketId, channelId }) {
    const ticket = await this.ticket(guildId, ticketId);
    this.channel(ticket, channelId);
    await this.permissions.requireClose(guildId, userId, ticket, ticket);
    if (!ticket.initialized) throw clientError(409, 'Este ticket não está aberto.');
    assertActiveState(ticket);
    return ticket;
  }
  async close(input) {
    const { guildId, userId, ticketId, channelId } = input;
    return this.exclusive(guildId, async () => {
      const ticket = await this.canClose(input);
      if (!ticket.closing) {
        const closing = { actorUserId: userId, reason: requiredText(input.reason, 1000),
          summary: requiredText(input.summary || '', 1000, false), startedAt: this.now(),
          transcript: null, transcriptGenerated: false, transcriptPersisted: false,
          logMessageId: null, logPublished: false, locked: false, channelLocked: false, completed: false };
        if (this.repository.beginClose) {
          ticket = await this.repository.beginClose(ticket, closing) || await this.ticket(guildId, ticketId);
          if (ticket.status === S.CLOSED && ticket.closing?.completed) return ticket;
        } else {
          ticket.closing = closing;
          await this.repository.save(ticket);
        }
      }
      logger.info('ticket.close.started', { guildId, ticketId, userId, channelId });
      try {
        const closing = ticket.closing;
        if (!closing.transcript) {
          closing.transcript = await this.transcripts.generate(ticket);
          closing.transcriptGenerated = true;
          closing.transcriptPersisted = true;
          await this.repository.save(ticket);
        }
        if (!closing.logMessageId) {
          closing.logMessageId = await this.adapter.publishClosed(ticket, this.transcripts.read(closing.transcript));
          closing.logPublished = true;
          await this.repository.save(ticket);
        }
        await this.adapter.lockChannel(ticket);
        closing.locked = true;
        closing.channelLocked = true;
        await this.repository.save(ticket);
        // Mensagens enviadas durante a coleta inicial precisam entrar na captura final.
        if (await this.adapter.latestMessageId(ticket) !== closing.transcript.lastMessageId) {
          closing.transcript = await this.transcripts.generate(ticket);
          await this.repository.save(ticket);
        }
        // Também em retries: o arquivo local pode ter sido atualizado antes de uma falha no log.
        closing.logMessageId = await this.adapter.publishClosed(ticket, this.transcripts.read(closing.transcript));
        closing.logPublished = true;
        await this.repository.save(ticket);
        transition(ticket, S.CLOSED); ticket.closedAt = this.now(); closing.completed = true;
        ticket.archives.push({ cycle: ticket.reopenCount, channelId: ticket.channelId, closedAt: ticket.closedAt,
          reason: closing.reason, summary: closing.summary, transcript: closing.transcript, logMessageId: closing.logMessageId });
        this.event(ticket, E.CLOSED, closing.actorUserId, { reason: closing.reason, cycle: ticket.reopenCount });
        await this.repository.save(ticket);
        try { await this.adapter.updateInitial(ticket); } catch { logger.warn('ticket.message_update_failed', { guildId, ticketId, channelId }); }
        logger.info('ticket.closed', { guildId, ticketId, userId, channelId });
        return ticket;
      } catch (error) {
        logger.error('ticket.close.failed', { guildId, ticketId, userId, channelId });
        throw clientError(503, 'Não foi possível concluir a transcrição ou o encerramento; o canal foi preservado. Use Fechar novamente para retomar.');
      }
    });
  }
  async removeChannel({ guildId, userId, ticketId, channelId, cycle }) {
    return this.exclusive(guildId, async () => {
      const ticket = await this.ticket(guildId, ticketId);
      this.channel(ticket, channelId, true);
      await this.permissions.requireAction(TICKET_PERMISSION.DELETE_CHANNEL, guildId, userId, ticket, ticket);
      if (Number(cycle) !== ticket.reopenCount || ticket.status !== S.CLOSED || !ticket.closing?.completed || !ticket.closing.locked || ticket.reopening) throw clientError(409, 'A remoção exige um encerramento concluído deste ciclo.');
      if (!ticket.channelId) return ticket;
      this.transcripts.read(ticket.closing.transcript);
      await this.adapter.verifyClosedLog(ticket);
      await this.adapter.removeChannel(ticket);
      ticket.channelId = null;
      await this.repository.save(ticket);
      logger.info('ticket.channel.deleted', { guildId, ticketId, channelId });
      return ticket;
    });
  }
  async reopen({ guildId, userId, ticketId, channelId, cycle }) {
    return this.exclusive(guildId, async () => {
      const ticket = await this.ticket(guildId, ticketId);
      this.channel(ticket, channelId, true);
      const actor = await this.permissions.requireAction(TICKET_PERMISSION.REOPEN, guildId, userId, ticket, ticket);
      if (Number(cycle) !== ticket.reopenCount || ticket.status !== S.CLOSED || !ticket.closing?.completed) throw clientError(409, 'Somente o último encerramento de um ticket fechado pode ser reaberto.');
      const config = await this.config(guildId);
      await this.permissions.actor(guildId, ticket.creatorUserId);
      const previous = ticket.archives.at(-1);
      const attachment = this.transcripts.read(previous.transcript);
      if (!ticket.reopening) {
        await this.limits(guildId, ticket.creatorUserId, ticket.categoryId, ticket.id);
        if (this.now() - ticket.closedAt < 60_000) throw clientError(429, 'Aguarde 60 segundos após o encerramento para reabrir.');
        await this.adapter.validateStructure(config);
        ticket.reopening = { cycle: ticket.reopenCount + 1, actorUserId: userId, actorName: actor.name,
          startedAt: this.now(), channelId: null, initialMessageId: null };
        await this.repository.save(ticket);
      }
      const pending = ticket.reopening;
      const reopened = { ...ticket, status: S.REOPENED, reopenCount: pending.cycle,
        assignedUserId: null, assignedName: null, claimedAt: null, closing: null,
        reopenedBy: pending.actorUserId, reopenedByName: pending.actorName, reopenedAt: pending.startedAt,
        channelId: pending.channelId, initialMessageId: pending.initialMessageId };
      if (!pending.channelId) {
        pending.channelId = await this.adapter.createTicketChannel(reopened, config);
        reopened.channelId = pending.channelId;
        await this.repository.save(ticket);
      }
      if (!pending.initialMessageId) {
        pending.initialMessageId = await this.adapter.publishInitial(reopened, attachment);
        await this.repository.save(ticket);
      }
      transition(ticket, S.REOPENED);
      Object.assign(ticket, reopened, { channelId: pending.channelId, initialMessageId: pending.initialMessageId, reopening: null });
      this.event(ticket, E.REOPENED, pending.actorUserId, { cycle: pending.cycle, previousChannelId: previous.channelId });
      await this.repository.save(ticket);
      logger.info('ticket.reopened', { guildId, ticketId, staffUserId: userId, channelId: ticket.channelId });
      return ticket;
    });
  }
}
module.exports = { TicketService };
