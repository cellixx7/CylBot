const { logger } = require('../lib/logger');
async function handleCommand(interaction, commands) {
  const command = commands.find(
    (registeredCommand) => registeredCommand.data.name === interaction.commandName,
  );

  if (!command) {
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error('discord.command_failed', { module: 'commandHandler', command: interaction.commandName,
      guildId: interaction.guildId, userId: interaction.user?.id, channelId: interaction.channelId, error });

    const response = {
      content: 'Não foi possível executar este comando.',
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  }
}

module.exports = { handleCommand };