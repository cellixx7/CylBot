const { logger } = require('../lib/logger');
const { errorDetails } = require('../lib/ticketDiagnostics');
const { humanRequested } = require('../services/ticketAIContract');

class TicketAIMessageHandler {
  constructor(service, { debounceMs = 2000, maxEntries = 500 } = {}) {
    Object.assign(this, { service, debounceMs, maxEntries });
    this.pending = new Map();
  }
  enqueue(input) {
    if (input.bot || !input.guildId || !input.content?.trim() || !this.service.repository) return;
    const key = `${input.guildId}:${input.channelId}:${input.userId}`;
    const previous = this.pending.get(key);
    if (previous) clearTimeout(previous.timer);
    if (!previous && this.pending.size >= this.maxEntries) return;
    // Pedido de humano não pode ser perdido por debounce nem esperar outra geração.
    if (humanRequested(input.content)) {
      this.pending.delete(key);
      return this.dispatch(input);
    }
    const timer = setTimeout(() => { this.pending.delete(key); void this.dispatch(input); }, this.debounceMs);
    timer.unref?.();
    this.pending.set(key, { timer });
  }
  async dispatch(input) {
    try { return await this.service.onMessage(input); }
    catch (error) { logger.warn('ticket.ai.failed', { guildId: input.guildId, channelId: input.channelId, ...errorDetails(error) }); }
  }
  stop() { for (const { timer } of this.pending.values()) clearTimeout(timer); this.pending.clear(); }
}
module.exports = { TicketAIMessageHandler };
