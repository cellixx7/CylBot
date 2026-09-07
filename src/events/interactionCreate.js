const { handleCommand } = require('../handlers/commandHandler');
const { handleIaTextInteraction } = require('../handlers/iaTextHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (await handleIaTextInteraction(interaction)) {
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    await handleCommand(interaction, client.commands);
  },
};