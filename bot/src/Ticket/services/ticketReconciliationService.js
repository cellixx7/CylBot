const { logger } = require('../../lib/logger');
const { TicketConfigurationError } = require('./ticketDomain');
const { ticketLogContext, errorDetails } = require('../lib/ticketDiagnostics');

class TicketReconciliationService {
  constructor({ adapter, repository }) {
    Object.assign(this, { adapter, repository });
  }

  async checkConfig(config) {
    const issues = [];
    let failure;
    if (!config?.ready) issues.push('A configuração de tickets não está concluída.');
    if (!issues.length) {
      try {
        await this.adapter.validateStructure(config);
      } catch (error) {
        failure = errorDetails(error);
        issues.push(error.statusCode && error.statusCode < 500 ? error.message : 'Os recursos Discord ou as permissões do bot estão inválidos.');
      }
    }
    if (issues.length) logger.warn('ticket.reconciliation.failed', { ...ticketLogContext(), guildId: config?.guildId, issueCount: issues.length, ...failure });
    return { ok: issues.length === 0, issues };
  }

  async assertConfig(config) {
    const result = await this.checkConfig(config);
    if (!result.ok) throw new TicketConfigurationError(`A configuração de tickets deste servidor está inválida: ${result.issues.join(' ')}`);
    return config;
  }

  async assertTicketChannel(ticket) {
    if (!ticket.channelId || typeof this.adapter.channel !== 'function') return ticket;
    try {
      await this.adapter.channel(ticket.guildId, ticket.channelId);
    } catch (error) {
      logger.warn('ticket.reconciliation.failed', { ...ticketLogContext(), guildId: ticket.guildId, ticketId: ticket.id, channelId: ticket.channelId, issueCount: 1, ...errorDetails(error) });
      throw Object.assign(new TicketConfigurationError('O canal deste ticket não existe mais. O ticket foi preservado; remova o canal ausente ou reabra pelo fluxo de recuperação.'), { cause: error });
    }
    return ticket;
  }

  async reconcileActiveTickets(tickets, closedAt = Date.now()) {
    const active = [];
    for (const ticket of tickets) {
      if (!ticket.initialized || ticket.closing || ticket.reopening || !['OPEN', 'CLAIMED', 'REOPENED'].includes(ticket.status)) {
        active.push(ticket);
        continue;
      }
      if (await this.adapter.ticketChannelExists(ticket)) {
        active.push(ticket);
        continue;
      }
      const closed = await this.repository.closeMissingChannel(ticket, closedAt);
      logger.warn('ticket.channel_missing_closed', {
        ...ticketLogContext(), guildId: ticket.guildId, ticketId: ticket.id,
        channelId: ticket.channelId, reconciled: Boolean(closed),
      });
    }
    return active;
  }

  async channelDeleted({ guildId, channelId }, closedAt = Date.now()) {
    const ticket = await this.repository.findByChannelId(guildId, channelId);
    if (!ticket || !ticket.initialized || ticket.closing || ticket.reopening
      || !['OPEN', 'CLAIMED', 'REOPENED'].includes(ticket.status)) return null;
    const closed = await this.repository.closeMissingChannel(ticket, closedAt);
    logger.warn('ticket.channel_missing_closed', {
      guildId, ticketId: ticket.id, channelId, reconciled: Boolean(closed), source: 'channelDelete',
    });
    return closed;
  }
}

module.exports = { TicketReconciliationService };
