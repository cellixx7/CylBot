const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { startTicketSetup } = require('../handlers/ticketHandler');
const { startTicketAIConfig } = require('../handlers/ticketAIHandler');
module.exports = {
  data: new SlashCommandBuilder().setName('ticket').setDescription('Configure o sistema de tickets deste servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false)
    .addStringOption(option => option.setName('ia').setDescription('Configuração administrativa do assistente IA')
      .addChoices({ name: 'Configurar IA', value: 'configurar' })),
  execute: interaction => interaction.options?.getString?.('ia') === 'configurar' ? startTicketAIConfig(interaction) : startTicketSetup(interaction),
};
