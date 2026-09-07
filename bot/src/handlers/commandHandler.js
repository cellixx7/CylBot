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
    console.error(`Erro ao executar /${interaction.commandName}:`, error);

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