const { handleCommand } = require('../handlers/commandHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    await handleCommand(interaction, client.commands);
  },
};