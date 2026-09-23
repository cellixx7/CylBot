const { CAPABILITIES } = require('./ticketAIContract');

class TicketAIPolicyService {
  constructor(access) { this.access = access; }
  hasAccess(guildId) { return Boolean(this.access.enabled && this.access.guildIds.includes(guildId)); }
  active(ticket) { return ['OPEN', 'REOPENED', 'CLAIMED'].includes(ticket.status) && ticket.initialized && ticket.channelId && !ticket.closing && !ticket.reopening; }
  canGenerate({ ticket, config, state, automatic }) {
    return Boolean(this.hasAccess(ticket.guildId) && config.enabled && config.autonomyLevel > 0 && !state.paused && !state.escalatedAt
      && this.active(ticket) && (!automatic || !ticket.assignedUserId));
  }
  decide(proposal, context) {
    const { ticket, config, humanRequest, state, automatic } = context;
    // Pedido explícito é direito do usuário e não depende de modelo, entitlement ou allowlist.
    if (humanRequest && this.active(ticket)) return { mode: state.escalatedAt ? 'none' : 'execute', action: 'ESCALATE_TO_HUMAN', reason: 'user_requested_human' };
    if (!this.canGenerate(context)) return { mode: 'deny', action: 'NO_ACTION', reason: 'policy_restriction' };
    if (proposal.action === 'NO_ACTION') return { mode: 'none', action: 'NO_ACTION', reason: proposal.reason };
    const capability = CAPABILITIES[proposal.action];
    if (!capability || !config.capabilities.includes(capability)) return { mode: 'deny', action: 'NO_ACTION', reason: 'policy_restriction' };
    if (proposal.requiresHuman || proposal.confidence < 0.6 || proposal.action === 'ESCALATE_TO_HUMAN') {
      if (!config.humanEscalationEnabled || !config.capabilities.includes('request_human')) return { mode: 'suggest', action: proposal.action, reason: 'policy_restriction' };
      return { mode: automatic && config.autonomyLevel >= 2 ? 'execute' : 'suggest', action: 'ESCALATE_TO_HUMAN',
        reason: proposal.confidence < 0.6 ? 'low_confidence' : proposal.requiresHuman ? 'sensitive_action_required' : proposal.reason };
    }
    if (!automatic || config.autonomyLevel === 1 || ['SUMMARIZE', 'SUGGEST_CLOSE'].includes(proposal.action)) {
      return { mode: 'suggest', action: proposal.action, reason: proposal.reason };
    }
    // Os níveis 2 e 3 compartilham as mesmas ações seguras em V1. Sem ações administrativas.
    return { mode: 'execute', action: proposal.action, reason: proposal.reason };
  }
}
module.exports = { TicketAIPolicyService };
