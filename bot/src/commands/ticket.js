const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { startTicketSetup } = require('../handlers/ticketHandler');
module.exports = {
  data: new SlashCommandBuilder().setName('ticket').setDescription('Configure o sistema de tickets deste servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false),
  execute: startTicketSetup,
};
