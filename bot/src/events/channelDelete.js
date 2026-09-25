const { logger } = require('../lib/logger');
const { errorDetails } = require('../Ticket/lib/ticketDiagnostics');

module.exports = {
  name: 'channelDelete',
  async execute(channel, client) {
    if (!channel?.guildId || !channel.id) return;
    try {
      await client.services.ticketReconciliation.channelDeleted({ guildId: channel.guildId, channelId: channel.id });
    } catch (error) {
      logger.error('ticket.channel_delete_reconciliation_failed', {
        guildId: channel.guildId, channelId: channel.id, ...errorDetails(error),
      });
    }
  },
};
