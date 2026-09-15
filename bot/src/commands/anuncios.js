const { SlashCommandBuilder } = require('discord.js');
const { categoryPicker } = require('../handlers/announcementHandler');
module.exports = {
  data: new SlashCommandBuilder().setName('anuncios').setDescription('Crie anúncios com os padrões do servidor.').setDMPermission(false),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Use este comando em um servidor.', ephemeral: true });
    await interaction.reply({ ...categoryPicker(interaction.guildId), ephemeral: true });
  },
};
