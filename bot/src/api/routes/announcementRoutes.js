const { readJson, sendJson } = require('../http/json');
const { clientError } = require('../http/errors');
const { PermissionFlagsBits } = require('discord.js');
const { requireSession } = require('../http/auth');
const { requireSendableChannel } = require('../http/channelPermissions');

async function handle(request, response, context) {
  if (request.method !== 'POST' || !request.url.startsWith('/api/announcements/')) return false;
  await handleAnnouncements(request, response, context);
  return true;
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
      return sendJson(response, 200, { categories: announcements.categories(guild.id), guildName: guild.name });
    case '/api/announcements/save':
      announcements.save(guild.id, body.category || {}, authorization);
      return sendJson(response, 200, { categories: announcements.categories(guild.id) });
    case '/api/announcements/generate': {
      const result = await announcements.generate({ guildId: guild.id, guildName: guild.name, owner,
        categoryId: body.categoryId, description: body.description, draftId: body.draftId, context: body.context });
      return sendJson(response, 200, result);
    }
    case '/api/announcements/send': {
      if (!/^\d{17,20}$/.test(body.channelId || '')) throw clientError(400, 'Informe um ID de canal válido.');
      const channel = await client.channels.fetch(body.channelId);
      if (!channel) throw clientError(400, 'Canal não encontrado.');
      requireSession(request, services);
      requireSendableChannel(client, channel, guild.id);
      await announcements.send(body.draftId, owner, guild.id, channel);
      return sendJson(response, 200, { ok: true });
    }
    default: throw clientError(404, 'Rota não encontrada.');
  }
}

module.exports = { handle };
