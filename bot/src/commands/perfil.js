const { SlashCommandBuilder } = require('discord.js');
const { profileCard, identity } = require('../handlers/profileHandler');
module.exports = {
  data: new SlashCommandBuilder().setName('perfil').setDescription('Veja e personalize seu perfil CYL.')
    .addUserOption(option => option.setName('usuario').setDescription('Perfil de outro membro da comunidade')),
  async execute(i) {
    await i.deferReply({ ephemeral: true });
    try {
      const target = i.options.getUser('usuario') || i.user;
      if (target.bot) return i.editReply({ content: 'Os perfis CYL são destinados aos membros da comunidade.' });
      const services = i.client.services;
      if (target.id === i.user.id && services.users) await services.users.upsertDiscordUser(identity(i.user));
      const data = await services.profiles.get({ viewerId: i.user.id, userId: target.id, guildId: i.guildId || undefined, identity: identity(i.user) });
      await i.editReply(profileCard(data, services.auth.config.webOrigin, i.guildId));
    } catch (error) { await i.editReply({ content: error.statusCode ? error.message : 'Não foi possível abrir seu perfil. Tente novamente.' }); }
  },
};
