const { logger } = require('../../lib/logger');
const { errorDetails } = require('../lib/ticketDiagnostics');

class TicketMessageHandler {
  constructor({ messages, ai }) { Object.assign(this, { messages, ai }); }
  async handle(input) {
    if (!this.messages?.repository) return;
    try {
      const result = await this.messages.ingestDiscordMessage(input);
      if (!result || result.duplicate || result.message.authorType !== 'USER') return result;
      this.ai.enqueue({ guildId: result.ticket.guildId, ticketId: result.ticket.id, channelId: result.ticket.channelId,
        userId: result.message.authorDiscordId, messageId: result.message.id, content: result.message.content, bot: false });
      return result;
    } catch (error) {
      logger.warn('ticket.message.ingest_failed', { guildId: input.guildId, channelId: input.channelId, ...errorDetails(error) });
    }
  }
}

module.exports = { TicketMessageHandler };
