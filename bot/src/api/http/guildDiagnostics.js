const { randomUUID } = require('node:crypto');
const { logger } = require('../../lib/logger');

const clientIds = new WeakMap();
function instanceId(client) {
  if (!client) return undefined;
  if (!clientIds.has(client)) clientIds.set(client, randomUUID());
  return clientIds.get(client);
}

// Explicit allowlist for development: no session, OAuth payload or headers.
function logGuildRead(event, { services, client, requestId, guildId, guild, stage, result, code }) {
  if (services.auth.config.production) return;
  const dashboardClient = services.dashboard.client;
  if (!dashboardClient?.guilds?.cache || typeof dashboardClient.isReady !== 'function') return;
  const ticketClient = services.ticketRead?.permissions?.adapter?.client;
  logger.info(event, {
    module: 'guild-access', requestId, processId: process.pid,
    clientInstanceId: instanceId(dashboardClient),
    sameRouteClient: client ? client === dashboardClient : undefined,
    sameTicketClient: ticketClient ? ticketClient === dashboardClient : undefined,
    guildId, guildIdType: typeof guildId,
    discordReady: dashboardClient.isReady(),
    cacheHasGuild: dashboardClient.guilds.cache.has(guildId),
    botInstalledSource: 'client.guilds.cache.has',
    botInstalled: guild?.botInstalled, canManage: guild?.canManage, canViewTickets: guild?.canViewTickets,
    stage, result, code,
  });
}

module.exports = { logGuildRead };
