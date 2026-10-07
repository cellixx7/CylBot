const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
function announcementClient(guildId, userId = 'user', permissions = P.Administrator) {
  return { isReady: () => true, services: { plans: { requireCommunityGuild: async () => {} } },
    guilds: { cache: new Map([[guildId, { id: guildId, ownerId: 'owner', members: { fetch: async () => ({ id: userId, user: { bot: false }, permissions: new PermissionsBitField(permissions) }) } }]]) } };
}
module.exports = { announcementClient };
