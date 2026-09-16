const { PermissionFlagsBits } = require('discord.js');
const { clientError } = require('./errors');

function requireSendableChannel(client, channel, guildId) {
  if (!guildId || channel?.guildId !== guildId) throw clientError(403, 'FORBIDDEN');
  if (!channel.isTextBased?.() || typeof channel.send !== 'function') throw clientError(400, 'O Channel ID não pertence a um canal de texto enviável.');
  const permissions = client.user && channel.permissionsFor?.(client.user);
  const send = channel.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(send)) throw clientError(403, 'O bot não possui permissão para publicar nesse canal.');
}

module.exports = { requireSendableChannel };
