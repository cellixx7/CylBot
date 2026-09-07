const { SlashCommandBuilder } = require('discord.js');
const presenceConfig = require('../config/presence');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('callsense')
    .setDescription('Ativa as notificações de entrada na call de resenha.'),

  async execute(interaction) {
    if (interaction.user.id !== presenceConfig.ownerId) {
      await interaction.reply({
        content: 'Você não tem permissão para ativar o CallSense.',
        ephemeral: true,
      });
      return;
    }

    const knownUsers = interaction.client.callSenseManager.activate();

    await interaction.reply({
      content: `CallSense ativado. ${knownUsers} usuário(s) atual(is) serão ignorados; apenas novas entradas serão notificadas por DM.`,
      ephemeral: true,
    });
  },
};