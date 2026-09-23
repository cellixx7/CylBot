const { logger } = require('../lib/logger');
const { getConfig } = require('../config/env');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { sendJson } = require('./http/json');
const { setCorsHeaders } = require('./http/cors');
const { requireSession, requireTrustedOrigin, clearSession } = require('./http/auth');
const { RateLimiter } = require('./http/rateLimit');
const { setSecurityHeaders } = require('./http/securityHeaders');
const { isClientError } = require('./http/errors');
const routes = [
  require('./routes/authRoutes'),
  require('./routes/dashboardRoutes'),
  require('./routes/healthRoutes'),
  require('./routes/announcementRoutes'),
  require('./routes/aiRoutes'),
  require('./routes/discordRoutes'),
];

function createRequestHandler(context) {
  const limiter = context.rateLimiter || new RateLimiter();
  const authConfig = context.services?.auth?.config || getConfig().auth;
  return async (request, response) => {
    const requestId = randomUUID();
    const routeContext = { ...context, requestId };
    response.setHeader('X-Request-Id', requestId);
    setCorsHeaders(response, authConfig, request);
    setSecurityHeaders(response);

    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      const sensitivePost = request.method === 'POST' &&
        (path === '/api/ai/generate' || path === '/api/discord/send' || path.startsWith('/api/announcements/'));
      if (sensitivePost) {
        routeContext.session = requireSession(request, context.services);
        response.setHeader('Cache-Control', 'no-store');
      }
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) requireTrustedOrigin(request, authConfig.allowedOrigins);
      if (sensitivePost) {
        const userId = routeContext.session.user.id;
        limiter.consume(`post:${userId}`, 30);
        if (path === '/api/ai/generate') limiter.consume(`ai:${userId}`, 10);
        if (path === '/api/announcements/generate') limiter.consume(`announcement-ai:${userId}`, 10);
        if (path === '/api/discord/send' || path === '/api/announcements/send') limiter.consume(`send:${userId}`, 10);
      }
      if (request.method === 'GET' && path === '/api/auth/discord') {
        limiter.consume(`oauth:${request.socket?.remoteAddress || 'unknown'}`, 10);
      }
      if (request.method === 'POST' && path === '/api/auth/logout') {
        let userId;
        try { userId = requireSession(request, context.services).user.id; } catch {}
        limiter.consume(`logout:${userId || request.socket?.remoteAddress || 'unknown'}`, 30);
      }
      for (const route of routes) {
        if (await route.handle(request, response, routeContext)) return;
      }
      sendJson(response, 404, { error: 'Rota não encontrada.' });
    } catch (error) {
      const controlled = isClientError(error);
      const statusCode = controlled ? error.statusCode : 500;
      if (statusCode === 401 && context.services?.auth) clearSession(request, response, context.services);
      if (controlled && error.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
      logger[statusCode >= 500 ? 'error' : 'warn']('api.request_failed', {
        module: 'api', operation: 'http.request', requestId, method: request.method,
        path: request.url.split('?')[0], statusCode,
        error: controlled ? error : { name: 'Error', message: 'Falha interna não detalhada.' },
      });
      sendJson(response, statusCode, {
        error: controlled ? error.message : 'Não foi possível concluir a operação.',
      });
    }
  };
}

function startApiServer(client, services, { port }) {
  const context = { client, services };
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
