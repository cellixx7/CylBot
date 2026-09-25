const { randomUUID } = require('node:crypto');
const { clientError } = require('../../api/http/errors');
const { RateLimiter } = require('../../api/http/rateLimit');
const { logger } = require('../../lib/logger');
const { errorDetails } = require('../lib/ticketDiagnostics');
const { validateConfig, validateOutput, normalizeHandoff, OUTPUT_SCHEMA, humanRequested, noAction } = require('./ticketAIContract');

function confirmsClosure(text) {
  const normalized = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return /^(?:nao|nao,? pode encerrar|nao preciso(?: de mais nada)?|nada mais|pode encerrar|encerra|finaliza|(?:esta )?resolvido|obrigad[oa],? pode encerrar)[.! ]*$/.test(normalized);
}

class TicketAIService {
  constructor({ repository, tickets, provider, context, policy, actions, settings, limiter = new RateLimiter(), now = Date.now }) {
    Object.assign(this, { repository, tickets, provider, context, policy, actions, settings, limiter, now });
  }
  requireStorage() { if (!this.repository) throw clientError(503, 'IA de tickets requer PostgreSQL e migrations aplicadas.'); }
  async getConfig({ guildId, userId }) {
    this.requireStorage(); await this.tickets.permissions.requireAdmin(guildId, userId);
    return this.repository.getConfig(guildId);
  }
  async configure({ guildId, userId, config }) {
    this.requireStorage(); await this.tickets.permissions.requireAdmin(guildId, userId);
    this.limiter.consume(`config:${userId}`, 10);
    return this.repository.saveConfig(guildId, validateConfig(config));
  }
  async getStatus({ guildId, ticketId, userId }) {
    this.requireStorage();
    const ticket = await this.tickets.ticket(guildId, ticketId);
    const actor = await this.tickets.permissions.requireStaff(guildId, userId, ticket);
    const [config, state] = await Promise.all([
      this.repository.getConfig(guildId), this.repository.getState(guildId, ticketId),
    ]);
    const active = this.policy.active(ticket);
    return {
      available: this.policy.hasAccess(guildId), enabled: config.enabled,
      autonomyLevel: config.autonomyLevel, assistantName: config.assistantName,
      paused: Boolean(state.paused), escalated: Boolean(state.escalatedAt),
      escalatedAt: state.escalatedAt || null,
      canGenerateSuggestion: this.policy.canGenerate({ ticket, config, state, automatic: false }),
      canPause: active && !state.paused, canResume: active && Boolean(state.paused),
      canConfigure: this.tickets.permissions.admin(actor),
    };
  }
  async pause({ guildId, ticketId, userId, paused }) {
    this.requireStorage();
    if (typeof paused !== 'boolean') throw clientError(400, 'Informe paused booleano.');
    const ticket = await this.tickets.ticket(guildId, ticketId);
    await this.tickets.permissions.requireStaff(guildId, userId, ticket);
    await this.repository.locked(guildId, ticketId, async ({ patch, audit }) => {
      await patch({ paused, ...(!paused ? { escalatedAt: null, followUpDueAt: null,
        awaitingClosureConfirmation: false, handoffReason: null } : {}), leaseId: null, leaseExpiresAt: null });
      await audit({ trigger: 'staff', status: paused ? 'paused' : 'resumed', reason: 'staff_override' });
    });
    logger.info(paused ? 'ticket.ai.paused' : 'ticket.ai.resumed', { guildId, ticketId, userId });
    return { paused };
  }
  async analyze({ guildId, ticketId, userId }) {
    return this.run({ guildId, ticketId, userId, automatic: false, trigger: 'staff' });
  }
  async onMessage({ guildId, ticketId, channelId, userId, messageId, content, bot }) {
    if (bot || !guildId || !ticketId || !this.repository) return;
    let ticket;
    try { ticket = await this.tickets.ticket(guildId, ticketId); }
    catch (error) { if (error.statusCode === 404) return; throw error; }
    if (channelId && channelId !== ticket.channelId || ticket.creatorUserId !== userId || !this.policy.active(ticket)) return;
    const state = await this.repository.getState(guildId, ticket.id);
    if (state.awaitingClosureConfirmation) {
      if (confirmsClosure(content)) {
        await this.repository.locked(guildId, ticket.id, async ({ patch, audit }) => {
          await patch({ followUpDueAt: null, awaitingClosureConfirmation: false, handoffReason: null });
          await audit({ trigger: 'message', status: 'completed', actionExecuted: 'SUGGEST_CLOSE',
            reason: 'user_confirmed_closure' });
        });
        await this.actions.closingNotice(ticket);
        await this.tickets.close({ guildId, ticketId: ticket.id, channelId: ticket.channelId, userId,
          reason: 'Encerrado após confirmação do usuário.', summary: 'O usuário informou que não precisava de mais ajuda.' });
        logger.info('ticket.ai.follow_up_closed', { guildId, ticketId: ticket.id, reason: 'user_confirmed_closure' });
        return { status: 'closed' };
      }
      await this.repository.locked(guildId, ticket.id, async ({ patch, audit }) => {
        await patch({ paused: false, escalatedAt: null, followUpDueAt: null,
          awaitingClosureConfirmation: false, handoffReason: null, leaseId: null, leaseExpiresAt: null });
        await audit({ trigger: 'message', status: 'resumed', reason: 'user_needs_more_help' });
      });
      logger.info('ticket.ai.follow_up_resumed', { guildId, ticketId: ticket.id, reason: 'user_needs_more_help' });
    }
    return this.run({ guildId, ticketId: ticket.id, userId, messageId, automatic: true, trigger: 'message', humanRequest: humanRequested(content) });
  }
  async processInactivity(limit = 20) {
    if (!this.repository?.claimDueFollowUps) return [];
    const now = this.now();
    const due = await this.repository.claimDueFollowUps(now, limit);
    const results = [];
    for (const item of due) {
      try {
        const ticket = await this.tickets.ticket(item.guildId, item.ticketId);
        if (!this.policy.active(ticket) || ticket.assignedUserId) {
          await this.repository.locked(item.guildId, item.ticketId, async ({ patch }) => patch({
            followUpDueAt: null, awaitingClosureConfirmation: false, handoffReason: null,
          }));
          continue;
        }
        const delivered = await this.actions.inactivityFollowUp(ticket, item.reason);
        if (delivered?.deliveryStatus !== 'SENT') throw Object.assign(new Error('Falha no acompanhamento da IA.'), { code: 'AI_FOLLOW_UP_DELIVERY_FAILED' });
        logger.info('ticket.ai.follow_up_sent', { ...item });
        results.push(item);
      } catch (error) {
        logger.warn('ticket.ai.follow_up_failed', { guildId: item.guildId, ticketId: item.ticketId,
          reason: item.reason || 'unsupported_request', ...errorDetails(error) });
        try {
          await this.repository.locked(item.guildId, item.ticketId, async ({ ticket, patch }) => {
            if (this.policy.active(ticket)) await patch({ awaitingClosureConfirmation: false,
              followUpDueAt: new Date(now + 60000) });
          });
        } catch { /* O ticket pode ter sido removido durante a tentativa. */ }
      }
    }
    return results;
  }
  async run(input) {
    this.requireStorage();
    let ticket = await this.tickets.ticket(input.guildId, input.ticketId);
    const actor = await this.tickets.permissions.actor(input.guildId, input.userId);
    if (input.automatic) {
      if (actor.id !== ticket.creatorUserId || this.tickets.permissions.staff(actor, ticket)) return { status: 'denied', proposal: noAction('policy_restriction') };
    } else await this.tickets.permissions.requireStaff(input.guildId, input.userId, ticket);
    const config = await this.repository.getConfig(input.guildId);
    const state = await this.repository.getState(input.guildId, input.ticketId);
    const runId = randomUUID();
    const base = { guildId: input.guildId, ticketId: input.ticketId, runId };
    if (input.humanRequest) {
      const proposal = { message: 'Atendimento humano solicitado.', action: 'ESCALATE_TO_HUMAN', confidence: 1, reason: 'user_requested_human', requiresHuman: true };
      const decision = await this.actions.apply({ ...input, runId, now: this.now() }, proposal);
      if (decision.notifyHuman) await this.actions.notifyHuman(decision.ticket, runId, proposal.message, proposal.reason);
      return { status: 'escalated', proposal, decision: { mode: decision.mode, action: decision.action } };
    }
    if (!this.policy.canGenerate({ ticket, config, state, automatic: input.automatic })) return { status: 'denied', proposal: noAction('policy_restriction') };
    this.limiter.consume(`user:${input.userId}`, 8);
    this.limiter.consume(`guild:${input.guildId}`, 30);
    this.limiter.consume(`ticket:${input.ticketId}`, 4);
    const started = this.now();
    const reserved = await this.repository.reserve({ ...input, runId, now: started, audit: { trigger: input.trigger, model: this.settings.model } });
    if (!reserved) return { status: 'limited', proposal: noAction('no_action') };
    logger.info('ticket.ai.requested', base);
    let proposal = noAction('no_action');
    let usage = {};
    try {
      const messages = await this.context.build(ticket, config);
      const result = await this.provider.generateTicket({ messages, schema: OUTPUT_SCHEMA, model: this.settings.model, timeoutMs: this.settings.timeoutMs });
      const tokenCount = n => Number.isSafeInteger(n) && n >= 0 && n < 10000000 ? n : null;
      usage = { inputTokens: tokenCount(result.inputTokens), outputTokens: tokenCount(result.outputTokens) };
      proposal = normalizeHandoff(validateOutput(result.raw));
      logger.info('ticket.ai.action_proposed', { ...base, action: proposal.action });
      const decision = await this.actions.apply({ ...input, runId, now: this.now() }, proposal);
      if (decision.notifyHuman) await this.actions.notifyHuman(decision.ticket, runId, proposal.message, proposal.reason);
      const status = decision.mode === 'deny' ? 'denied' : decision.mode === 'suggest' ? 'suggested' : 'completed';
      await this.repository.finish(input.guildId, input.ticketId, runId, { ...usage, status, actionProposed: proposal.action,
        actionExecuted: decision.mode === 'execute' ? decision.action : null, confidence: Math.round(proposal.confidence * 100),
        requiredHuman: decision.action === 'ESCALATE_TO_HUMAN' || proposal.requiresHuman, reason: decision.reason, latencyMs: this.now() - started });
      logger.info('ticket.ai.completed', { ...base, status, ...usage });
      return { runId, status, proposal: decision.mode === 'deny' ? noAction('policy_restriction') : proposal,
        decision: { mode: decision.mode, action: decision.action, reason: decision.reason } };
    } catch (error) {
      logger.warn('ticket.ai.failed', { ...base, ...errorDetails(error) });
      await this.repository.finish(input.guildId, input.ticketId, runId, { ...usage, status: 'failed', actionProposed: proposal.action,
        reason: 'generation_or_delivery_failed', latencyMs: this.now() - started });
      return { runId, status: 'failed', proposal: noAction('no_action') };
    }
  }
}
module.exports = { TicketAIService };
