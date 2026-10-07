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
  require('../Ticket/api/ticketReadRoutes'),
  require('../Ticket/api/ticketActionRoutes'),
  require('../Ticket/api/ticketMessageRoutes'),
  require('../Ticket/api/ticketToolsRoutes'),
  require('../Ticket/api/ticketAIRoutes'),
  require('./routes/authRoutes'),
  require('./routes/dashboardRoutes'),
  require('./routes/communityPreviewRoutes'),
  require('./routes/healthRoutes'),
  require('./routes/announcementRoutes'),
  require('./routes/planRoutes'),
  require('./routes/profileRoutes'),
  require('./routes/aiRoutes'),
  require('./routes/discordRoutes'),
];

function createRequestHandler(context) {
  const limiter = context.rateLimiter || new RateLimiter();
  const authConfig = context.services?.auth?.config || getConfig().auth;
  const rateLimits = context.rateLimits || getConfig().rateLimits;
  return async (request, response) => {
    const requestId = randomUUID();
    const routeContext = { ...context, requestId };
    response.setHeader('X-Request-Id', requestId);
    setCorsHeaders(response, authConfig, request);
    setSecurityHeaders(response, { hsts: authConfig.production && authConfig.secure });

    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      // Hidrata a sessão persistente e renova OAuth antes dos handlers síncronos existentes.
      if (context.services?.auth?.sessions?.repository && path !== '/api/auth/logout' && path !== '/api/auth/discord/callback' && path !== '/api/auth/discord' && path.startsWith('/api/')) {
        const { readCookie } = require('./http/cookies');
        const id = readCookie(request, 'cylbot_session');
        const session = await context.services.auth.sessions.authenticate(id);
        request.authResolved = true; request.authSession = session;
      }
      if (path === '/api/tickets' || path.startsWith('/api/tickets/')) {
        response.setHeader('Cache-Control', 'no-store');
        const session = requireSession(request, context.services);
        const userId = session.user.id;
        if (request.method === 'GET' && path.startsWith('/api/tickets/ai/config/')) limiter.consume(`tickets-ai:${userId}`, rateLimits.ticketAI, 'tickets-ai');
        else if (request.method === 'GET') limiter.consume(`tickets-read:${userId}`, rateLimits.ticketReads, 'tickets-read');
        else if (request.method === 'POST' && path.includes('/tools/')) limiter.consume(`tickets-moderation:${userId}`, rateLimits.ticketModeration, 'tickets-moderation');
        else if (path.includes('/ai/')) limiter.consume(`tickets-ai:${userId}`, rateLimits.ticketAI, 'tickets-ai');
        else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) limiter.consume(`tickets-write:${userId}`, rateLimits.ticketWrites, 'tickets-write');
      }
      if (path.startsWith('/api/profile/') && request.method === 'PATCH') {
        const session = requireSession(request, context.services);
        limiter.consume(`profile-write:${session.user.id}`, 20);
      }
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
        if (path === '/api/announcements/generate' || path === '/api/announcements/workspace/suggest') limiter.consume(`announcement-ai:${userId}`, 10);
        if (path === '/api/discord/send' || path === '/api/announcements/send' || path === '/api/announcements/workspace/publish') limiter.consume(`announcement-publish:${userId}`, 10);
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
      if (statusCode === 401 && context.services?.auth) await clearSession(request, response, context.services);
      if (controlled && error.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
      logger[statusCode >= 500 ? 'error' : 'warn']('api.request_failed', {
        module: 'api', operation: 'http.request', requestId, method: request.method,
        path: request.url.split('?')[0], statusCode,
        limiterName: error.code?.startsWith?.('tickets-') ? error.code : undefined,
        retryAfter: error.retryAfter,
        error: controlled ? error : { name: 'Error', message: 'Falha interna não detalhada.' },
      });
      sendJson(response, statusCode, {
        error: controlled && error.code ? error.code : controlled ? error.message : 'Não foi possível concluir a operação.',
        ...(controlled && error.code ? { message: error.message } : {}),
        ...(controlled && error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      });
    }
  };
}

function startApiServer(client, services, { host = '127.0.0.1', port }) {
  const context = { client, services };
  const server = http.createServer(createRequestHandler(context));

  server.listen(port, host, () => {
    logger.info('api.started', { module: 'api', host, port });
  });

  server.on('error', (error) => {
    logger.error('api.listen_failed', { module: 'api', port, error });
  });

  return server;
}

function waitForServerListening(server) {
  if (server.listening) return Promise.resolve(server);
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError);
      resolve(server);
    };
    const onError = error => {
      server.off('listening', onListening);
      reject(error);
    };
    server.once('listening', onListening);
    server.once('error', onError);
  });
}

module.exports = { startApiServer, waitForServerListening, createRequestHandler };
