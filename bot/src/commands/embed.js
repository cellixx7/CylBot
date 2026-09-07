const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Envia uma mensagem formatada como embed.')
    .addStringOption((option) =>
      option
        .setName('titulo')
        .setDescription('Título do embed.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('descricao')
        .setDescription('Descrição do embed.')
        .setRequired(true),
    ),

  async execute(interaction) {
    const title = interaction.options.getString('titulo', true);
    const description = interaction.options.getString('descricao', true);
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(0x5865f2);

    await interaction.reply({ embeds: [embed] });
  },
};