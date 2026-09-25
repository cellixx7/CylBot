const { logger } = require('../../lib/logger');
const { errorDetails } = require('../lib/ticketDiagnostics');
const { humanRequested } = require('../services/ticketAIContract');

class TicketAIMessageHandler {
  constructor(service, { debounceMs = 2000, maxEntries = 500, followUpPollMs = 5000 } = {}) {
    Object.assign(this, { service, debounceMs, maxEntries, followUpPollMs });
    this.pending = new Map();
    if (followUpPollMs > 0 && this.service.repository && this.service.processInactivity) {
      this.followUpTimer = setInterval(() => void this.dispatchInactivity(), followUpPollMs);
      this.followUpTimer.unref?.();
    }
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
  async dispatchInactivity() {
    if (this.followUpBusy) return;
    this.followUpBusy = true;
    try { return await this.service.processInactivity(); }
    catch (error) { logger.warn('ticket.ai.follow_up_failed', errorDetails(error)); }
    finally { this.followUpBusy = false; }
  }
  stop() {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    if (this.followUpTimer) clearInterval(this.followUpTimer);
  }
}
module.exports = { TicketAIMessageHandler };
