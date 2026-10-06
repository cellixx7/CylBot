const { clientError } = require('../../api/http/errors');
const { TICKET_PERMISSION } = require('./ticketPermissionService');
const { ticketFilters } = require('./ticketFilters');
const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');

// Explicit allowlist: lifecycle state, transcript paths and audit data stay private.
function ticketDto(ticket, actions, now = Date.now()) {
  return {
    id: ticket.id, guildId: ticket.guildId, guildName: ticket.guildName,
    publicNumber: ticket.publicNumber ?? ticket.sequence,
    subject: ticket.subject, description: ticket.description, status: ticket.status,
    categoryId: ticket.categoryKey || ticket.categoryId, categoryName: ticket.categoryName, creatorName: ticket.creatorName,
    creatorUserId: ticket.creatorUserId, assignedUserId: ticket.assignedUserId || null,
    assignedName: ticket.assignedName || null, createdAt: ticket.createdAt,
    claimedAt: ticket.claimedAt || null, closedAt: ticket.closedAt || null,
    reopenedAt: ticket.reopenedAt || null,
    finalizing: ticket.closing && !ticket.closing.completed ? ticket.closing.outcome || 'CLOSED' : null,
    ...(actions ? { actions } : {}),
    ...(Number.isFinite(ticket.closedAt) && ['CLOSED', 'CONCLUDED'].includes(ticket.status) && ticket.closedAt + 60_000 > now
      ? { reopenAvailableAt: new Date(ticket.closedAt + 60_000).toISOString() } : {}),
  };
}

function ticketActions(ticket, actor, permissions, now = Date.now()) {
  const active = ticket.initialized && !ticket.closing && !ticket.reopening && ['OPEN', 'CLAIMED', 'REOPENED'].includes(ticket.status);
  const staff = permissions.staff(actor, ticket);
  const partial = Boolean(ticket.initialized && ticket.closing && !ticket.closing.completed && !ticket.reopening && ['OPEN', 'CLAIMED', 'REOPENED'].includes(ticket.status));
  return { canClaim: staff && active && !ticket.assignedUserId,
    canRespond: active && (actor.id === ticket.creatorUserId || staff && ticket.assignedUserId === actor.id),
    canClose: (active || partial && (ticket.closing.outcome || 'CLOSED') === 'CLOSED') && (actor.id === ticket.creatorUserId || staff),
    canConclude: staff && (active || Boolean(partial && ticket.closing.outcome === 'CONCLUDED')),
    canReopen: Boolean(staff && ['CLOSED', 'CONCLUDED'].includes(ticket.status) && ticket.closing?.completed && ticket.closing?.transcript && !ticket.reopening && now >= ticket.closedAt + 60_000) };
}

class TicketReadService {
  constructor({ tickets, permissions, messages, tools, now = Date.now }) { Object.assign(this, { tickets, permissions, messages, tools, now }); }
  requireStorage() {
    this.messages.requireStorage();
    if (!this.tickets.repository.listVisiblePage) throw clientError(503, 'A consulta de tickets requer PostgreSQL.');
  }
  async list({ guildId, userId, limit = 25, before, filters }) {
    this.requireStorage();
    const actor = await this.permissions.actor(guildId, userId);
    const access = { userId: actor.id, roleIds: actor.roleIds, admin: this.permissions.admin(actor) };
    const [page, stats, config] = await Promise.all([
      this.tickets.repository.listVisiblePage(guildId, { ...access, limit, before, filters: ticketFilters(filters) }),
      this.tickets.repository.getVisibleStats?.(guildId, access),
      this.tickets.configs.get(guildId),
    ]);
    return { tickets: page.tickets.map(ticket => ticketDto(ticket)), nextBefore: page.nextBefore,
      ...(stats ? { stats } : {}), categories: (config?.categories || []).map(({ id, name }) => ({ id, name })) };
  }
  async detail({ guildId, ticketId, userId }) {
    this.requireStorage();
    const ticket = await this.tickets.ticket(guildId, ticketId);
    const actor = await this.permissions.requireAction(TICKET_PERMISSION.VIEW, guildId, userId, ticket, ticket);
    const staff = this.permissions.staff(actor, ticket);
    const bits = new PermissionsBitField(actor.permissions);
    const tools = this.tools ? { available: staff && [P.ManageRoles, P.ModerateMembers, P.BanMembers].some(bit => bits.has(bit)) } : null;
    const now = this.now();
    return { ticket: ticketDto(ticket, ticketActions(ticket, actor, this.permissions, now), now),
      ...(tools ? { tools } : {}), history: staff ? ticket.events.map(event => ({ type: event.type, createdAt: event.createdAt,
        actorUserId: event.actorUserId, action: event.metadata?.action, result: event.metadata?.result })) : [] };
  }
}
module.exports = { TicketReadService, ticketActions, ticketDto };
