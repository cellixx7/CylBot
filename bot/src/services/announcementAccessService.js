const { PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const { codedClientError } = require('../api/http/errors');
const { communityRequired } = require('./planService');
async function requireGuildAdministrator(client, guildId, userId) {
  if (!client?.isReady?.()) throw codedClientError(503, 'DISCORD_NOT_READY', 'O CylBot está conectando. Tente novamente em instantes.');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw codedClientError(403, 'ADMINISTRATOR_REQUIRED', 'Você precisa ser administrador deste servidor.');
  let member;
  try { member = await guild.members.fetch({ user: userId, force: true }); }
  catch (error) {
    if ([10007, 50001, 50013].includes(Number(error.code))) throw codedClientError(403, 'ADMINISTRATOR_REQUIRED', 'Você precisa ser administrador deste servidor.');
    throw codedClientError(503, 'ADMINISTRATOR_CHECK_UNAVAILABLE', 'Não foi possível verificar suas permissões no Discord. Tente novamente.');
  }
  let administrator = false;
  try { administrator = new PermissionsBitField(member.permissions?.bitfield ?? member.permissions).has(PermissionFlagsBits.Administrator); } catch {}
  if (!member || member.user?.bot || member.id !== userId || !(guild.ownerId === userId || administrator)) throw codedClientError(403, 'ADMINISTRATOR_REQUIRED', 'Você precisa ser administrador deste servidor.');
  return guild;
}
async function requireAnnouncementAccess({ client, services }, guildId, userId) {
  const guild = await requireGuildAdministrator(client, guildId, userId);
  if (!services?.plans) throw communityRequired();
  await services.plans.requireCommunityGuild(guildId);
  return guild;
}
module.exports = { requireGuildAdministrator, requireAnnouncementAccess };
