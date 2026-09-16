const { PermissionsBitField, PermissionFlagsBits } = require('discord.js');

const MANAGE_ANNOUNCEMENTS_MESSAGE = 'Você precisa da permissão Gerenciar Servidor para alterar os padrões de anúncios.';

// Contexto criado pelo servidor/handler, nunca a partir do body HTTP.
// Uma futura identidade web autenticada deve fornecer permissões verificadas da guild.
function canManageAnnouncements(context = {}) {
  if (context.source === 'local-web' && context.trustedLocal === true) return true;
  const permissions = context.permissions ?? context.member?.permissions;
  if (permissions == null) return false;
  try {
    return new PermissionsBitField(permissions).has(PermissionFlagsBits.ManageGuild);
  } catch {
    return false;
  }
}

function assertCanManageAnnouncements(context) {
  if (!canManageAnnouncements(context)) {
    throw Object.assign(new Error(MANAGE_ANNOUNCEMENTS_MESSAGE), { statusCode: 403 });
  }
}

module.exports = { canManageAnnouncements, assertCanManageAnnouncements };
