const { interactionHandlers } = require('../handlers/interactionHandlers');
const { handleCommand } = require('../handlers/commandHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client, handlers = interactionHandlers) {
    for (const handler of handlers) {
      if (await handler(interaction, client.services)) return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.commandName === 'ticket') {
      client.metrics ||= {};
      client.metrics.ticketCommandsUsed = Number(client.metrics.ticketCommandsUsed || 0) + 1;
    }

    await handleCommand(interaction, client.commands);
  },
};
