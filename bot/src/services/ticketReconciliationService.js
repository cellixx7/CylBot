const { logger } = require('../lib/logger');
const { TicketConfigurationError } = require('./ticketDomain');

class TicketReconciliationService {
  constructor({ adapter, repository }) {
    Object.assign(this, { adapter, repository });
  }

  async checkConfig(config) {
    const issues = [];
    if (!config?.ready) issues.push('A configuração de tickets não está concluída.');
    if (!issues.length) {
      try {
        await this.adapter.validateStructure(config);
      } catch (error) {
        issues.push(error.statusCode && error.statusCode < 500 ? error.message : 'Os recursos Discord ou as permissões do bot estão inválidos.');
      }
    }
    if (issues.length) logger.warn('ticket.reconciliation.failed', { guildId: config?.guildId, issueCount: issues.length });
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
      logger.warn('ticket.reconciliation.failed', { guildId: ticket.guildId, ticketId: ticket.id, channelId: ticket.channelId, issueCount: 1 });
      throw new TicketConfigurationError('O canal deste ticket não existe mais. O ticket foi preservado; remova o canal ausente ou reabra pelo fluxo de recuperação.');
    }
    return ticket;
  }
}

module.exports = { TicketReconciliationService };
