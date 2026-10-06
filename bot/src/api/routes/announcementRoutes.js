const { readJson, sendJson } = require('../http/json');
const { clientError } = require('../http/errors');
const { PermissionFlagsBits } = require('discord.js');
const { requireSession } = require('../http/auth');
const { requireSendableChannel } = require('../http/channelPermissions');
const { COMMUNITY_CHANNELS } = require('./communityPreviewRoutes');

async function handle(request, response, context) {
  if (!request.url.startsWith('/api/announcements/')) return false;
  if (request.method === 'GET' && new URL(request.url, 'http://localhost').pathname === '/api/announcements/workspace') {
    await getWorkspace(request, response, context);
    return true;
  }
  if (request.method !== 'POST') return false;
  await handleAnnouncements(request, response, context);
  return true;
}

function sendableChannels(client, guild) {
  const communityChannels = new Set(Object.values(COMMUNITY_CHANNELS));
  return [...guild.channels.cache.values()].filter(channel => channel?.isTextBased?.() && typeof channel.send === 'function')
    .map(channel => ({ id: channel.id, name: channel.name || 'canal', canPublish: (() => {
      const permissions = client.user && channel.permissionsFor?.(client.user);
      const send = channel.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
      return Boolean(permissions?.has(PermissionFlagsBits.ViewChannel) && permissions.has(send));
    })(), communityVisible: communityChannels.has(channel.id), type: channel.id === COMMUNITY_CHANNELS.avisos ? 'NOTICE' : channel.id === COMMUNITY_CHANNELS.atualizacoes ? 'UPDATE' : null }))
    // A Etapa 3 só publica nos dois destinos oficiais que já alimentam a comunidade web.
    .filter(channel => channel.canPublish && channel.communityVisible).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

async function getWorkspace(request, response, { client, services }) {
  const session = requireSession(request, services);
  const guildId = new URL(request.url, 'http://localhost').searchParams.get('guildId');
  if (!/^\d{17,20}$/.test(guildId || '')) throw clientError(400, 'Informe um ID de servidor válido.');
  await services.dashboard.requireManageableGuild(session, guildId);
  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw clientError(403, 'FORBIDDEN');
  sendJson(response, 200, { guildName: guild.name, channels: sendableChannels(client, guild), recent: await services.announcements.recent(guildId) });
}

async function handleAnnouncements(request, response, { client, services, session }) {
  const { announcements } = services;
  const body = await readJson(request);
  if (!/^\d{17,20}$/.test(body.guildId || '')) throw clientError(400, 'Informe um ID de servidor válido.');
  await services.dashboard.requireManageableGuild(session, body.guildId);
  requireSession(request, services);
  const guild = client.guilds.cache.get(body.guildId);
  if (!guild) throw clientError(403, 'FORBIDDEN');
  // Concede a capacidade interna somente após autorização real via OAuth/cache.
  const authorization = { source: 'web', permissions: PermissionFlagsBits.ManageGuild };
  const owner = `web:${session.user.id}`;
  switch (request.url) {
    case '/api/announcements/categories':
      return sendJson(response, 200, { categories: await announcements.categories(guild.id), guildName: guild.name });
    case '/api/announcements/save':
      await announcements.save(guild.id, body.category || {}, authorization);
      return sendJson(response, 200, { categories: await announcements.categories(guild.id) });
    case '/api/announcements/generate': {
      const result = await announcements.generate({ guildId: guild.id, guildName: guild.name, owner,
        categoryId: body.categoryId, description: body.description, draftId: body.draftId, context: body.context });
      return sendJson(response, 200, result);
    }
    case '/api/announcements/workspace/generate': {
      if (!/^\d{17,20}$/.test(body.channelId || '')) throw clientError(400, 'Informe um ID de canal válido.');
      const result = await announcements.generateWorkspace({ guildId: guild.id, guildName: guild.name, owner,
        type: body.type, title: body.title, content: body.content, channelId: body.channelId, context: body.context, useAI: body.useAI === true });
      return sendJson(response, 200, result);
    }
    case '/api/announcements/workspace/suggest': {
      const suggestion = await announcements.suggestWorkspace({ guildName: guild.name, type: body.type, intent: body.intent, context: body.context });
      return sendJson(response, 200, { suggestion });
    }
    case '/api/announcements/workspace/publish': {
      if (!/^[\da-f-]{36}$/i.test(body.draftId || '')) throw clientError(400, 'Gere uma prévia antes de publicar.');
      if (!/^\d{17,20}$/.test(body.channelId || '')) throw clientError(400, 'Informe um ID de canal válido.');
      const officialChannel = body.type === 'NOTICE' ? COMMUNITY_CHANNELS.avisos : body.type === 'UPDATE' ? COMMUNITY_CHANNELS.atualizacoes : null;
      if (!officialChannel || body.channelId !== officialChannel) throw clientError(400, 'O canal oficial deste tipo ainda não está configurado.');
      const channel = await client.channels.fetch(body.channelId);
      requireSession(request, services);
      requireSendableChannel(client, channel, guild.id);
      const publication = await announcements.publishWorkspace({ draftId: body.draftId, owner, guildId: guild.id, channel, forwardedBy: session.user,
        communityVisible: body.communityVisible === true && Object.values(COMMUNITY_CHANNELS).includes(channel.id) });
      return sendJson(response, 200, { publication });
    }
    case '/api/announcements/send': {
      if (!/^\d{17,20}$/.test(body.channelId || '')) throw clientError(400, 'Informe um ID de canal válido.');
      const channel = await client.channels.fetch(body.channelId);
      if (!channel) throw clientError(400, 'Canal não encontrado.');
      requireSession(request, services);
      requireSendableChannel(client, channel, guild.id);
      await announcements.send(body.draftId, owner, guild.id, channel, session.user);
      return sendJson(response, 200, { ok: true });
    }
    default: throw clientError(404, 'Rota não encontrada.');
  }
}

module.exports = { handle, sendableChannels };
