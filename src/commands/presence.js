const { ActivityType, SlashCommandBuilder } = require('discord.js');
const presenceConfig = require('../config/presence');

const activityTypes = {
  jogando: ActivityType.Playing,
  transmitindo: ActivityType.Streaming,
  ouvindo: ActivityType.Listening,
  assistindo: ActivityType.Watching,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('presence')
    .setDescription('Configura o modo da rich presence do bot.')
    .addStringOption((option) =>
      option
        .setName('modo')
        .setDescription('Escolha o comportamento da rich presence.')
        .setRequired(true)
        .addChoices(
          { name: 'Rich presence com texto', value: 'manual' },
          { name: 'Rich presence Spotify', value: 'spotify' },
          { name: 'Rich presence padrão', value: 'padrao' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('tipo')
        .setDescription('Tipo da atividade.')
        .setRequired(false)
        .addChoices(
          { name: 'Jogando', value: 'jogando' },
          { name: 'Transmitindo', value: 'transmitindo' },
          { name: 'Ouvindo', value: 'ouvindo' },
          { name: 'Assistindo', value: 'assistindo' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('texto')
        .setDescription('Texto exibido na atividade.')
        .setRequired(false)
        .setMaxLength(128),
    )
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('URL da transmissão, necessária para o tipo Transmitindo.')
        .setRequired(false),
    ),

  async execute(interaction) {
    if (interaction.user.id !== presenceConfig.ownerId) {
      await interaction.reply({
        content: 'Você não tem permissão para alterar a rich presence.',
        ephemeral: true,
      });
      return;
    }

    const mode = interaction.options.getString('modo', true);
    const typeName = interaction.options.getString('tipo');
    const name = interaction.options.getString('texto');
    const url = interaction.options.getString('url');

    if (mode === 'padrao') {
      interaction.client.presenceManager.setStandardMode();
      await interaction.reply({
        content: 'Rich presence padrão ativada: call, Spotify e links.',
        ephemeral: true,
      });
      return;
    }

    if (mode === 'spotify') {
      interaction.client.presenceManager.setSpotifyMode();
      await interaction.reply({
        content: 'Rich presence Spotify ativada.',
        ephemeral: true,
      });
      return;
    }

    if (!typeName || !name) {
      await interaction.reply({
        content: 'O modo com texto exige os campos tipo e texto.',
        ephemeral: true,
      });
      return;
    }

    if (typeName === 'transmitindo' && !url) {
      await interaction.reply({
        content: 'O tipo Transmitindo exige uma URL.',
        ephemeral: true,
      });
      return;
    }

    if (url && !isValidUrl(url)) {
      await interaction.reply({
        content: 'A URL informada não é válida.',
        ephemeral: true,
      });
      return;
    }

    interaction.client.presenceManager.setManualMode({
      type: activityTypes[typeName],
      name,
      ...(url ? { url } : {}),
    });

    await interaction.reply({
      content: `Rich presence manual alterada para **${name}**.`,
      ephemeral: true,
    });
  },
};

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}