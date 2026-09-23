const { randomUUID } = require('node:crypto');
const { logger } = require('../lib/logger');

class TicketAIActionService {
  // Não recebe TicketService: não dispõe de close, delete, SQL livre ou ferramentas do modelo.
  constructor({ repository, adapter, policy, permissions }) { Object.assign(this, { repository, adapter, policy, permissions }); }
  async apply(input, proposal) {
    // Revalida a identidade depois da espera no provider, antes de adquirir locks do banco.
    const actor = await this.permissions.actor(input.guildId, input.userId);
    return this.repository.locked(input.guildId, input.ticketId, async ({ ticket, state, config, patch, audit }) => {
      if (!input.humanRequest && state.leaseId !== input.runId) return { mode: 'deny', action: 'NO_ACTION', reason: 'stale_run' };
      if (!input.humanRequest && state.leaseExpiresAt && new Date(state.leaseExpiresAt).getTime() <= Date.now()) return { mode: 'deny', action: 'NO_ACTION', reason: 'stale_run' };
      if (input.automatic) {
        if (actor.id !== ticket.creatorUserId || this.permissions.staff(actor, ticket)) return { mode: 'deny', action: 'NO_ACTION', reason: 'staff_override' };
      } else await this.permissions.requireStaff(input.guildId, input.userId, ticket);
      const decision = this.policy.decide(proposal, { ticket, config, state, automatic: input.automatic, humanRequest: input.humanRequest });
      const log = { guildId: input.guildId, ticketId: ticket.id, runId: input.runId, action: decision.action, reason: decision.reason };
      if (decision.mode === 'execute' && decision.action === 'ESCALATE_TO_HUMAN') {
        // Pausa crítica persiste antes de qualquer notificação. Falha no Discord não reativa IA.
        await patch({ paused: true, escalatedAt: new Date(), leaseId: null, leaseExpiresAt: null });
        await audit({ id: randomUUID(), trigger: 'handoff', status: 'escalated', actionExecuted: 'ESCALATE_TO_HUMAN',
          requiredHuman: true, reason: decision.reason });
        logger.info('ticket.ai.escalated', log);
        return { ...decision, notifyHuman: true, ticket };
      }
      if (decision.mode === 'execute' && ['REPLY', 'ASK_CLARIFICATION'].includes(decision.action)) {
        await this.adapter.aiReply(ticket, config, proposal.message, input.runId);
        logger.info('ticket.ai.action_executed', log);
      } else if (decision.mode === 'suggest' && input.automatic) {
        await this.adapter.aiSuggestion(ticket, proposal, input.runId);
      } else if (decision.mode === 'deny') logger.warn('ticket.ai.action_denied', log);
      return decision;
    });
  }
  async notifyHuman(ticket, runId) {
    try { await this.adapter.aiHandoff(ticket, runId); }
    catch { logger.warn('ticket.ai.notification_failed', { guildId: ticket.guildId, ticketId: ticket.id, runId }); }
  }
}
module.exports = { TicketAIActionService };
