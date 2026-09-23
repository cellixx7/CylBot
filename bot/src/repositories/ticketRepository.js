const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { TicketJsonStore } = require('./ticketJsonStore');

class TicketRepository {
  constructor(file = path.join(__dirname, '../../data/tickets.json')) { this.store = new TicketJsonStore(file); }
  get(guildId, id) { return this.store.read()[guildId]?.tickets?.[id] || null; }
  list(guildId) { return Object.values(this.store.read()[guildId]?.tickets || {}); }
  create(input) {
    const data = this.store.read();
    const guild = data[input.guildId] ||= { sequence: 0, tickets: {} };
    const ticket = { ...input, id: randomUUID(), sequence: ++guild.sequence };
    guild.tickets[ticket.id] = ticket;
    this.store.write(data);
    return structuredClone(ticket);
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
