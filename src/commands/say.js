const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Faz o bot repetir uma mensagem.')
    .addStringOption((option) =>
      option
        .setName('mensagem')
        .setDescription('Mensagem que o bot deve enviar.')
        .setRequired(true),
    ),

  async execute(interaction) {
    const message = interaction.options.getString('mensagem', true);
    await interaction.reply(message);
  },
};