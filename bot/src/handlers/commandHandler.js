const { logger } = require('../lib/logger');
const { MessageFlags } = require('discord.js');

function interactionResponseUnavailable(error) {
  return error?.code === 10062 || error?.code === 40060 || error?.code === 'InteractionAlreadyReplied';
}

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
    const unavailable = interactionResponseUnavailable(error);
    logger[unavailable ? 'warn' : 'error']('discord.command_failed', { module: 'commandHandler', command: interaction.commandName,
      guildId: interaction.guildId, userId: interaction.user?.id, channelId: interaction.channelId, error });
    if (unavailable) return;

    const response = {
      content: 'Não foi possível executar este comando.',
      flags: MessageFlags.Ephemeral,
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
    } catch (responseError) {
      logger.warn('discord.command_error_response_failed', {
        module: 'commandHandler', command: interaction.commandName,
        guildId: interaction.guildId, userId: interaction.user?.id,
        channelId: interaction.channelId, error: responseError,
      });
    }
  }
}

module.exports = { handleCommand, interactionResponseUnavailable };
