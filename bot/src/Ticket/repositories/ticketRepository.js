const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { TicketJsonStore } = require('./ticketJsonStore');

class TicketRepository {
  constructor(file = path.join(__dirname, '../../data/tickets.json')) { this.store = new TicketJsonStore(file); }
  get(guildId, id) { return this.store.read()[guildId]?.tickets?.[id] || null; }
  list(guildId) { return Object.values(this.store.read()[guildId]?.tickets || {}); }
  findByUser(guildId, userId) { return this.list(guildId).filter(ticket => ticket.creatorUserId === userId); }
  findPending(guildId, userId, categoryId) {
    return this.findByUser(guildId, userId).find(ticket => ticket.categoryId === categoryId && !ticket.initialized && ticket.status === 'OPEN') || null;
  }
  findActiveByUser(guildId, userId, excludeId) {
    return this.findByUser(guildId, userId).filter(ticket => ticket.id !== excludeId &&
      (['OPEN', 'CLAIMED', 'REOPENED'].includes(ticket.status) || ticket.reopening));
  }
  findByChannelId(guildId, channelId) { return this.list(guildId).find(ticket => ticket.channelId === channelId) || null; }
  create(input) {
    const data = this.store.read();
    const guild = data[input.guildId] ||= { sequence: 0, tickets: {} };
    const ticket = { ...input, id: randomUUID(), sequence: ++guild.sequence };
    guild.tickets[ticket.id] = ticket;
    this.store.write(data);
    return structuredClone(ticket);
  }
  closeMissingChannel(ticket, closedAt) {
    const current = this.get(ticket.guildId, ticket.id);
    if (!current || current.channelId !== ticket.channelId || !current.initialized || current.closing || current.reopening
      || !['OPEN', 'CLAIMED', 'REOPENED'].includes(current.status)) return null;
    const reason = 'Canal removido externamente no Discord.';
    current.status = 'CLOSED';
    current.channelId = null;
    current.initialMessageId = null;
    current.closedAt = closedAt;
    current.closing = { actorUserId: null, reason,
      summary: 'Encerrado automaticamente sem transcript porque o canal não existe mais.',
      startedAt: closedAt, completed: true, channelMissing: true, transcriptUnavailable: true };
    current.events.push({ type: 'TICKET_CLOSED', ticketId: current.id, actorUserId: null, createdAt: closedAt,
      metadata: { reason, cycle: current.reopenCount, source: 'discord_channel_missing' } });
    return this.save(current);
  }
  save(ticket) {
    const data = this.store.read();
    if (!data[ticket.guildId]?.tickets?.[ticket.id]) throw new Error('Ticket não encontrado no armazenamento.');
    data[ticket.guildId].tickets[ticket.id] = ticket;
    this.store.write(data);
    return structuredClone(ticket);
  }
}
module.exports = { TicketRepository };
