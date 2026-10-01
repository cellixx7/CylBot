const { sendJson } = require('../http/json');
const { isWebForwardedEmbed } = require('../../lib/webMessage');

const COMMUNITY_CHANNELS = {
  avisos: '1555274685476896799',
  atualizacoes: '1555274714191106179',
};
const MESSAGE_PAGE_SIZE = 100;
const MESSAGE_CACHE_TTL_MS = 30_000;
const messageCache = new Map();

function text(value, limit) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, limit);
}

function messageAccent(embed) {
  return Number.isInteger(embed?.color)
    ? `#${embed.color.toString(16).padStart(6, '0')}`
    : '#7c5cff';
}

function messageReactions(message) {
  if (!message?.reactions?.cache?.values) return [];
  return [...message.reactions.cache.values()].map(reaction => ({
    emoji: text(reaction.emoji?.name || reaction.emoji?.toString?.(), 32),
    count: Number(reaction.count || 0),
  })).filter(reaction => reaction.emoji && reaction.count > 0).slice(0, 5);
}

function messagePost(message, guildId, channelId) {
  const embed = message.embeds?.[0];
  const source = isWebForwardedEmbed(embed) ? 'web' : 'discord';
  const discordName = message.member?.displayName || message.author?.globalName || message.author?.username || 'Usuário do Discord';
  const discordAvatar = message.member?.displayAvatarURL?.({ extension: 'png', size: 64 }) ||
    message.author?.displayAvatarURL?.({ extension: 'png', size: 64 }) || null;
  const author = source === 'web'
    ? { name: text(embed?.author?.name, 256) || 'Usuário do painel', avatarUrl: text(embed?.author?.iconURL, 1000) || null }
    : { name: text(discordName, 256), avatarUrl: text(discordAvatar, 1000) || null };
  const content = text(embed?.description, 4096) || text(message.content, 2000) ||
    (embed?.fields || []).map(field => `${text(field.name, 256)}: ${text(field.value, 1024)}`).join('\n');
  return {
    id: message.id,
    source,
    author,
    title: text(embed?.title, 120) || null,
    content: content || 'Abra esta mensagem no Discord para ver todos os detalhes.',
    publishedAt: new Date(message.createdTimestamp || Date.now()).toISOString(),
    accent: messageAccent(embed),
    reactions: messageReactions(message),
    url: `https://discord.com/channels/${guildId}/${channelId}/${message.id}`,
  };
}

async function loadEntireChannel(channel, guildId, channelId) {
  const messagesById = new Map();
  let before;
  while (true) {
    const page = await channel.messages.fetch({ limit: MESSAGE_PAGE_SIZE, ...(before ? { before } : {}) });
    const messages = [...page.values()];
    for (const message of messages) messagesById.set(message.id, message);
    if (messages.length < MESSAGE_PAGE_SIZE) break;
    const oldestId = messages.at(-1)?.id;
    if (!oldestId || oldestId === before) break;
    before = oldestId;
  }
  return [...messagesById.values()]
    .sort((left, right) => Number(right.createdTimestamp || 0) - Number(left.createdTimestamp || 0))
    .map(message => messagePost(message, guildId, channelId));
}

async function fetchAllPosts(channel, guildId, channelId) {
  if (!channel?.messages?.fetch) return null;
  const now = Date.now();
  const cached = messageCache.get(channelId);
  if (cached && cached.expiresAt > now) return cached.value;

  const value = loadEntireChannel(channel, guildId, channelId)
    .catch(() => {
      messageCache.delete(channelId);
      return cached ? cached.value : null;
    });
  messageCache.set(channelId, { expiresAt: now + MESSAGE_CACHE_TTL_MS, value });
  return value;
}

function invalidateCommunityChannel(channelId) {
  if (channelId && Object.values(COMMUNITY_CHANNELS).includes(channelId)) messageCache.delete(channelId);
}

async function channelDetails(client, channelId) {
  const channel = client?.channels?.cache?.get(channelId);
  const guildId = channel?.guildId || channel?.guild?.id;
  if (!guildId) return { id: channelId, url: null, posts: null };
  return {
    id: channelId,
    url: `https://discord.com/channels/${guildId}/${channelId}`,
    guildId,
    posts: await fetchAllPosts(channel, guildId, channelId),
  };
}

async function handle(request, response, { client } = {}) {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (request.method !== 'GET' || path !== '/api/community-preview') return false;

  const entries = await Promise.all(Object.entries(COMMUNITY_CHANNELS).map(async ([name, id]) =>
    [name, await channelDetails(client, id)]));
  const channels = Object.fromEntries(entries);
  const guildId = Object.values(channels).find(channel => channel.guildId)?.guildId;
  const online = Boolean(client?.isReady?.() && client?.user);

  response.setHeader('Cache-Control', 'no-store');
  sendJson(response, 200, {
    bot: { online },
    communityUrl: guildId ? `https://discord.com/channels/${guildId}` : null,
    channels,
    metrics: {
      commands: Number(client?.commands?.size || 0),
      servers: Number(client?.guilds?.cache?.size || 0),
      ticketCommands: Number(client?.metrics?.ticketCommandsUsed || 0),
    },
  });
  return true;
}

module.exports = { handle, COMMUNITY_CHANNELS, messagePost, fetchAllPosts, invalidateCommunityChannel };
