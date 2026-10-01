const { EmbedBuilder } = require('discord.js');

const WEB_MESSAGE_MARKER = 'Enviado pelo painel CYL';

function safeName(user) {
  const name = user?.displayName || user?.username;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 256) : 'Usuário do painel';
}

function safeAvatar(user) {
  if (typeof user?.avatarUrl !== 'string') return undefined;
  try {
    const url = new URL(user.avatarUrl);
    return url.protocol === 'https:' && url.hostname === 'cdn.discordapp.com' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function webForwardedEmbed(input, user) {
  const embed = EmbedBuilder.from(input);
  const avatar = safeAvatar(user);
  embed.setAuthor({ name: safeName(user), ...(avatar ? { iconURL: avatar } : {}) });
  const footer = embed.data.footer;
  const existing = typeof footer?.text === 'string' ? footer.text.trim() : '';
  embed.setFooter({
    text: existing ? `${existing} • ${WEB_MESSAGE_MARKER}` : WEB_MESSAGE_MARKER,
    ...(footer?.icon_url ? { iconURL: footer.icon_url } : {}),
  });
  return embed;
}

function isWebForwardedEmbed(embed) {
  return typeof embed?.footer?.text === 'string' && embed.footer.text.includes(WEB_MESSAGE_MARKER);
}

module.exports = { WEB_MESSAGE_MARKER, webForwardedEmbed, isWebForwardedEmbed };
