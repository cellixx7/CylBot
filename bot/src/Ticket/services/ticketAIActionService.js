const { randomUUID } = require('node:crypto');
const { logger } = require('../../lib/logger');

class TicketAIActionService {
  // Não recebe TicketService: não dispõe de close, delete, SQL livre ou ferramentas do modelo.
  constructor({ repository, adapter, policy, permissions, messages }) { Object.assign(this, { repository, adapter, policy, permissions, messages }); }
  async apply(input, proposal) {
    // Revalida a identidade depois da espera no provider, antes de adquirir locks do banco.
    const actor = await this.permissions.actor(input.guildId, input.userId);
    const reserved = await this.repository.locked(input.guildId, input.ticketId, async ({ ticket, state, config, patch, audit, tx }) => {
      if (!input.humanRequest && state.leaseId !== input.runId) return { mode: 'deny', action: 'NO_ACTION', reason: 'stale_run' };
      if (!input.humanRequest && state.leaseExpiresAt && new Date(state.leaseExpiresAt).getTime() <= Date.now()) return { mode: 'deny', action: 'NO_ACTION', reason: 'stale_run' };
      if (input.automatic) {
        if (actor.id !== ticket.creatorUserId || this.permissions.staff(actor, ticket)) return { mode: 'deny', action: 'NO_ACTION', reason: 'staff_override' };
      } else this.permissions.assertStaff(actor, ticket);
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
        const message = await this.messages.reserveAIMessage({ ticket, config, proposal, runId: input.runId, db: tx });
        return { ...decision, ticket, message, log };
      } else if (decision.mode === 'suggest' && input.automatic) {
        const message = await this.messages.reserveAIMessage({ ticket, config, proposal, runId: input.runId, internal: true, db: tx });
        return { ...decision, ticket, message, log };
      } else if (decision.mode === 'deny') logger.warn('ticket.ai.action_denied', log);
      return decision;
    });
    if (reserved.message) {
      const delivered = await this.messages.deliver(reserved.ticket, reserved.message);
      if (delivered.deliveryStatus !== 'SENT') throw Object.assign(new Error('Falha ao entregar mensagem de IA.'), { code: 'AI_DELIVERY_FAILED' });
      logger.info(reserved.mode === 'execute' ? 'ticket.ai.action_executed' : 'ticket.ai.action_proposed', reserved.log);
      return { ...reserved, message: delivered };
    }
    return reserved;
  }
  async notifyHuman(ticket, runId) {
    try {
      await this.messages.createSystemMessage(ticket, { id: runId,
        content: 'Atendimento humano solicitado. A IA foi pausada; a equipe poderá assumir normalmente.' });
      await this.adapter.aiHandoffStaff(ticket, runId);
    }
    catch { logger.warn('ticket.ai.notification_failed', { guildId: ticket.guildId, ticketId: ticket.id, runId }); }
  }
}
module.exports = { TicketAIActionService };
