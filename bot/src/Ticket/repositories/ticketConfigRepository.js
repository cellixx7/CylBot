const path = require('node:path');
const { TicketJsonStore } = require('./ticketJsonStore');
class TicketConfigRepository {
  constructor(file = path.join(__dirname, '../../data/ticket-config.json')) { this.store = new TicketJsonStore(file); }
  get(guildId) { return this.store.read()[guildId] || null; }
  save(config) {
    const data = this.store.read();
    data[config.guildId] = config;
    this.store.write(data);
    return structuredClone(config);
  }
}
module.exports = { TicketConfigRepository };
