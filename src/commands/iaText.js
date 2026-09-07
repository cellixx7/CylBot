const {
  ActionRowBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('iatext')
    .setDescription('Gera uma mensagem bonita com o OpenRouter.')
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
      .setCustomId(`iatext:idea:${outputType}`)
      .setTitle('Criar texto com IA')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('iatext:idea')
            .setLabel('Qual é a ideia da mensagem?')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ex.: Avisando a todos que vai ter manutenção no bot')
            .setRequired(true)
            .setMaxLength(2000),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('iatext:characters')
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