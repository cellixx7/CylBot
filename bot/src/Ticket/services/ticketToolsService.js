const { PermissionFlagsBits: P } = require('discord.js');
const { clientError } = require('../../api/http/errors');
const { TICKET_PERMISSION } = require('./ticketPermissionService');
const { logger } = require('../../lib/logger');
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

// Use fresh Discord members and roles for every capability read and write.
function toolPolicy({ guild, actor, bot, target, roles }, now = Date.now()) {
  const above = (member, role) => member.id === guild.ownerId || member.roles.highest.comparePositionTo(role) > 0;
  const targetAllowed = target && target.id !== guild.ownerId && target.id !== actor.id && target.id !== bot.id
    && !target.user.bot && above(actor, target.roles.highest) && above(bot, target.roles.highest);
  const has = permission => Boolean(targetAllowed && actor.permissions.has(permission) && bot.permissions.has(permission));
  const manageableRoles = has(P.ManageRoles) ? [...roles.values()].filter(role => role.id !== guild.id && !role.managed
    && above(actor, role) && above(bot, role)
    && actor.permissions.has(role.permissions) && bot.permissions.has(role.permissions)) : [];
  const canTimeout = has(P.ModerateMembers) && !target.permissions.has(P.Administrator);
  return {
    target: target ? { id: target.id, name: target.displayName } : null,
    canManageRoles: manageableRoles.length > 0, canTimeout, canBan: has(P.BanMembers),
    canRemoveTimeout: Boolean(canTimeout && target.communicationDisabledUntilTimestamp > now),
    maxTimeoutMs: MAX_TIMEOUT_MS,
    roles: manageableRoles.map(role => ({ id: role.id, name: role.name, assigned: target.roles.cache.has(role.id) })),
  };
}

class TicketToolsService {
  constructor({ tickets, permissions, adapter, now = Date.now }) { Object.assign(this, { tickets, permissions, adapter, now }); }
  async authorize(ticket, userId) {
    const actor = await this.permissions.requireAction(TICKET_PERMISSION.VIEW, ticket.guildId, userId, ticket, ticket);
    this.permissions.assertStaff(actor, ticket);
    return actor;
  }
  async capabilities(ticket, actor) {
    if (!this.permissions.staff(actor, ticket)) return { canManageRoles: false, canTimeout: false, canBan: false, canRemoveTimeout: false, roles: [] };
    return toolPolicy(await this.currentContext(ticket, actor.id), this.now());
  }
  async currentContext(ticket, userId) {
    const context = await this.adapter.toolContext(ticket, userId);
    if (context.guild.id !== ticket.guildId || context.actor.id !== userId
      || context.target && context.target.id !== ticket.creatorUserId) throw clientError(403, 'Identidade Discord inválida para este ticket.');
    this.permissions.assertStaff({ id: context.actor.id, permissions: context.actor.permissions.bitfield.toString(),
      roleIds: [...context.actor.roles.cache.keys()] }, ticket);
    return context;
  }
  async read({ guildId, ticketId, userId }) {
    const ticket = await this.tickets.ticket(guildId, ticketId);
    return this.capabilities(ticket, await this.authorize(ticket, userId));
  }
  async execute({ guildId, ticketId, userId, action, reason, roleId, durationMs, confirm }) {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 400 || /[\u0000-\u001f]/.test(reason)) throw clientError(400, 'Informe um motivo de até 400 caracteres.');
    if (confirm !== true) throw clientError(400, 'Confirme explicitamente a ação.');
    return this.tickets.exclusive(guildId, async () => {
      const ticket = await this.tickets.ticket(guildId, ticketId);
      const context = { guildId, ticketId, actorUserId: userId, targetUserId: ticket.creatorUserId, action };
      try {
        await this.authorize(ticket, userId);
        const discord = await this.currentContext(ticket, userId);
        const capabilities = toolPolicy(discord, this.now());
        const role = capabilities.roles.find(item => item.id === roleId);
        if (['add-role', 'remove-role'].includes(action)) {
          if (!capabilities.canManageRoles || !role) throw clientError(403, 'Você ou o bot não podem gerenciar este cargo e usuário.');
          if (role.assigned === (action === 'add-role')) throw clientError(409, 'O cargo já está no estado solicitado.');
        } else if (action === 'timeout') {
          if (!capabilities.canTimeout) throw clientError(403, 'Você ou o bot não podem dar timeout neste usuário.');
          if (!Number.isSafeInteger(durationMs) || durationMs < 60000 || durationMs > MAX_TIMEOUT_MS) throw clientError(400, 'O timeout deve durar entre 1 minuto e 28 dias.');
        } else if (action === 'remove-timeout') {
          if (!capabilities.canRemoveTimeout) throw clientError(403, 'Não é possível remover o timeout deste usuário.');
        } else if (action === 'ban') {
          if (!capabilities.canBan) throw clientError(403, 'Você ou o bot não podem banir este usuário.');
        } else throw clientError(400, 'Ferramenta inválida.');
        await this.adapter.executeTool(discord, { action, roleId, durationMs,
          reason: `CYL ticket #${ticket.sequence ?? ticket.publicNumber} · ator ${userId}: ${reason.trim()}` });
        await this.audit(ticket, context, 'success', { roleId, durationMs, reason: reason.trim() });
        return { result: 'success' };
      } catch (error) {
        await this.audit(ticket, context, 'failed', { statusCode: error.statusCode || 502 });
        if (error.statusCode) throw error;
        throw clientError(502, 'O Discord não confirmou a ação. Atualize as ferramentas antes de tentar novamente.');
      }
    });
  }
  async audit(ticket, context, result, metadata) {
    const createdAt = this.now();
    logger[result === 'success' ? 'info' : 'warn']('ticket.tool', { ...context, timestamp: createdAt, result });
    const event = { ticketId: ticket.id, type: 'TICKET_TOOL', actorUserId: context.actorUserId, createdAt,
      metadata: { ...context, ...metadata, result } };
    try {
      if (this.tickets.repository.recordToolEvent) await this.tickets.repository.recordToolEvent(event);
      else { ticket.events.push(event); await this.tickets.repository.save(ticket); }
    } catch {
      // Never report a completed Discord action as retryable because audit storage failed.
      logger.error('ticket.tool.audit_failed', { ...context, timestamp: createdAt, result });
    }
  }
}
module.exports = { TicketToolsService, toolPolicy, MAX_TIMEOUT_MS };
