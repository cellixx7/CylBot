const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { categoryPicker } = require('../handlers/announcementHandler');
const { requireAnnouncementAccess } = require('../services/announcementAccessService');
module.exports = {
  data: new SlashCommandBuilder().setName('anuncios').setDescription('Crie anúncios com os padrões do servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Use este comando em um servidor.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      await requireAnnouncementAccess({ client: interaction.client, services: interaction.client.services }, interaction.guildId, interaction.user.id);
      await interaction.editReply(await categoryPicker(interaction.guildId, interaction.client.services.announcements));
    } catch (error) { await interaction.editReply({ content: error.statusCode ? error.message : 'Não foi possível abrir os anúncios. Tente novamente.' }); }
  },
};
