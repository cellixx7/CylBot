const { clientError } = require('../../api/http/errors');
const { TICKET_PERMISSION } = require('./ticketPermissionService');

// Explicit allowlist: lifecycle state, transcript paths and audit data stay private.
function ticketDto(ticket) {
  return {
    id: ticket.id, guildId: ticket.guildId, guildName: ticket.guildName,
    publicNumber: ticket.publicNumber ?? ticket.sequence,
    subject: ticket.subject, description: ticket.description, status: ticket.status,
    categoryName: ticket.categoryName, creatorName: ticket.creatorName,
    assignedName: ticket.assignedName || null, createdAt: ticket.createdAt,
    claimedAt: ticket.claimedAt || null, closedAt: ticket.closedAt || null,
    reopenedAt: ticket.reopenedAt || null,
  };
}

class TicketReadService {
  constructor({ tickets, permissions, messages }) { Object.assign(this, { tickets, permissions, messages }); }
  requireStorage() {
    this.messages.requireStorage();
    if (!this.tickets.repository.listVisiblePage) throw clientError(503, 'A consulta de tickets requer PostgreSQL.');
  }
  async list({ guildId, userId, limit = 25, before }) {
    this.requireStorage();
    const actor = await this.permissions.actor(guildId, userId);
    const page = await this.tickets.repository.listVisiblePage(guildId, {
      userId: actor.id, roleIds: actor.roleIds, admin: this.permissions.admin(actor), limit, before,
    });
    return { tickets: page.tickets.map(ticketDto), nextBefore: page.nextBefore };
  }
  async detail({ guildId, ticketId, userId }) {
    this.requireStorage();
    const ticket = await this.tickets.ticket(guildId, ticketId);
    await this.permissions.requireAction(TICKET_PERMISSION.VIEW, guildId, userId, ticket, ticket);
    return { ticket: ticketDto(ticket) };
  }
}
module.exports = { TicketReadService };
