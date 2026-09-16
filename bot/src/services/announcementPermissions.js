const { PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const { clientError } = require('../api/http/errors');

const MANAGE_ANNOUNCEMENTS_MESSAGE = 'Você precisa da permissão Gerenciar Servidor para alterar os padrões de anúncios.';

// Contexto criado pelo servidor/handler, nunca a partir do body HTTP.
// O adapter Web só fornece permissões após validar a guild via OAuth.
function canManageAnnouncements(context = {}) {
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
    throw clientError(403, MANAGE_ANNOUNCEMENTS_MESSAGE);
  }
}

module.exports = { canManageAnnouncements, assertCanManageAnnouncements };
