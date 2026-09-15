const {
  ActionRowBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('texta_ai')
    .setDescription('Texta_AI: transforme sua ideia em uma mensagem.')
    .addStringOption((option) =>
      option
        .setName('tipo')
        .setDescription('Formato da mensagem gerada.')
        .setRequired(true)
        .addChoices(
          { name: 'Embed', value: 'embed' },
          { name: 'Content', value: 'content' },
        ),
    ),

  async execute(interaction) {
    const outputType = interaction.options.getString('tipo', true);
    const modal = new ModalBuilder()
      .setCustomId(`texta_ai:idea:${outputType}`)
      .setTitle('Texta_AI — Criar texto')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('texta_ai:idea')
            .setLabel('Qual é a ideia da mensagem?')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ex.: Avisando a todos que vai ter manutenção no bot')
            .setRequired(true)
            .setMaxLength(2000),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('texta_ai:characters')
            .setLabel('Tamanho aproximado em caracteres')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex.: 200')
            .setRequired(true)
            .setMaxLength(4),
        ),
      );

    await interaction.showModal(modal);
  },
};
