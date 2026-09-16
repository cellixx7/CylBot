const { logger } = require('../lib/logger');
const { getConfig } = require('../config/env');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { announcements } = require('../services/announcementService');
const OpenRouterService = require('../services/openRouterService');
const { TextaAIService } = require('../services/textaAIService');
const { DiscordOAuthProvider } = require('../providers/discordOAuthProvider');
const { AuthService } = require('../services/authService');
const { AuthSessionManager } = require('../services/authSessionManager');
const { DashboardService } = require('../services/dashboardService');
const { sendJson } = require('./http/json');
const { setCorsHeaders } = require('./http/cors');
const routes = [
  require('./routes/authRoutes'),
  require('./routes/dashboardRoutes'),
  require('./routes/healthRoutes'),
  require('./routes/announcementRoutes'),
  require('./routes/aiRoutes'),
  require('./routes/discordRoutes'),
];

const openRouterService = new OpenRouterService(getConfig().openRouter);

function createRequestHandler(context) {
  return async (request, response) => {
    const requestId = randomUUID();
    const routeContext = { ...context, requestId };
    response.setHeader('X-Request-Id', requestId);
    setCorsHeaders(response, context.services?.auth?.config.webOrigin || getConfig().auth.webOrigin);

    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    try {
      for (const route of routes) {
        if (await route.handle(request, response, routeContext)) return;
      }
      sendJson(response, 404, { error: 'Rota não encontrada.' });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      logger[statusCode >= 500 ? 'error' : 'warn']('api.request_failed', {
        module: 'api', operation: 'http.request', requestId, method: request.method,
        path: request.url.split('?')[0], statusCode, error,
      });
      sendJson(response, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'Não foi possível concluir a operação.',
      });
    }
  };
}

function startApiServer(client, { port } = getConfig().api) {
  const authConfig = getConfig().auth;
  const oauthProvider = new DiscordOAuthProvider(authConfig);
  const context = {
    client,
    services: {
      auth: new AuthService({ config: authConfig, provider: oauthProvider,
        sessions: new AuthSessionManager({ ttlSeconds: authConfig.sessionTtlSeconds }) }),
      dashboard: new DashboardService({ provider: oauthProvider, client }),
      announcements,
      openRouter: openRouterService,
      textaAI: new TextaAIService({ ai: openRouterService }),
    },
  };
  const server = http.createServer(createRequestHandler(context));

  server.listen(port, '127.0.0.1', () => {
    logger.info('api.started', { module: 'api', host: '127.0.0.1', port });
  });

  server.on('error', (error) => {
    logger.error('api.listen_failed', { module: 'api', port, error });
  });

  return server;
}

module.exports = { startApiServer, createRequestHandler };
