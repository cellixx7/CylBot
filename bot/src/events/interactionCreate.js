const { handleAnnouncementInteraction } = require('../handlers/announcementHandler');
const { handleCommand } = require('../handlers/commandHandler');
const { handleTextaAIInteraction } = require('../handlers/textaAIHandler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (await handleAnnouncementInteraction(interaction)) return;
    if (await handleTextaAIInteraction(interaction)) {
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    await handleCommand(interaction, client.commands);
  },
};