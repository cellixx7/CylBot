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
        const escalatedAt = new Date(input.now || Date.now());
        await patch({ paused: true, escalatedAt, handoffReason: decision.reason,
          followUpDueAt: new Date(escalatedAt.getTime() + config.inactivityTimeoutSeconds * 1000),
          awaitingClosureConfirmation: false, leaseId: null, leaseExpiresAt: null });
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
  async notifyHuman(ticket, runId, message = 'Atendimento humano solicitado.', reason = 'user_requested_human') {
    try {
      await this.messages.createSystemMessage(ticket, { id: runId,
        content: message === 'Atendimento humano solicitado.'
          ? 'Atendimento humano solicitado. A IA foi pausada; a equipe poderá assumir normalmente.' : message });
      await this.adapter.aiHandoffStaff(ticket, runId, reason);
    }
    catch { logger.warn('ticket.ai.notification_failed', { guildId: ticket.guildId, ticketId: ticket.id, runId }); }
  }
  async inactivityFollowUp(ticket, reason) {
    const explanations = {
      unsupported_request: ['o pedido está fora das capacidades seguras da IA', 'detalhar o contexto ou aguardar uma pessoa da equipe'],
      low_confidence: ['não há confiança suficiente para orientar com segurança', 'enviar mais detalhes, exemplos ou capturas de tela'],
      sensitive_action_required: ['a solicitação exige uma ação reservada à equipe', 'aguardar um atendente com as permissões necessárias'],
      repeated_failure: ['as tentativas automáticas não produziram uma resposta confiável', 'tentar novamente mais tarde ou aguardar a equipe'],
      user_requested_human: ['foi solicitado atendimento humano', 'aguardar uma pessoa da equipe'],
    };
    const [why, alternative] = explanations[reason] || explanations.unsupported_request;
    return this.messages.createSystemMessage(ticket, { content: `Ainda não houve uma resposta da equipe. Não consegui ajudar porque ${why}. Como alternativa, você pode ${alternative}.\n\nVocê precisa de mais alguma coisa? Responda **sim** para continuar ou **não, pode encerrar** para finalizar o ticket.` });
  }
  async closingNotice(ticket) {
    return this.messages.createSystemMessage(ticket, { content: 'Tudo certo. Vou encerrar o ticket agora.' });
  }
}
module.exports = { TicketAIActionService };
