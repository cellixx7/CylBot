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

    await handleCommand(interaction, client.commands);
  },
};
