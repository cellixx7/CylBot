const { sendJson } = require('../http/json');
const { cookie, readCookie } = require('../http/cookies');
const { clientError } = require('../http/errors');
const { STATE_TTL_SECONDS } = require('../../services/authService');
const { logger } = require('../../lib/logger');
const { requireTrustedOrigin } = require('../http/auth');

const SESSION_COOKIE = 'cylbot_session';
const STATE_COOKIE = 'cylbot_oauth_state';
const BINDING_COOKIE = 'cylbot_oauth_binding';

async function handle(request, response, { services, requestId }) {
  const url = new URL(request.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/auth/')) return false;
  const auth = services.auth;
  const { secure, webOrigin, sessionTtlSeconds } = auth.config;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (url.pathname === '/api/auth/discord' && request.method === 'GET') {
    const result = auth.begin(readCookie(request, STATE_COOKIE));
    response.setHeader('Set-Cookie', [cookie(STATE_COOKIE, result.state, STATE_TTL_SECONDS, secure), cookie(BINDING_COOKIE, result.binding, STATE_TTL_SECONDS, secure)]);
    logger.info('auth.discord_started', { module: 'auth', requestId });
    response.writeHead(302, { Location: result.url }).end();
    return true;
  }
  if (url.pathname === '/api/auth/discord/callback' && request.method === 'GET') {
    const cleared = [cookie(STATE_COOKIE, '', 0, secure), cookie(BINDING_COOKIE, '', 0, secure)];
    response.setHeader('Set-Cookie', cleared);
    try {
      const state = url.searchParams.get('state');
      if (!state || state !== readCookie(request, STATE_COOKIE) || url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length > 1) {
        throw clientError(400, 'Callback inválido.');
      }
      const session = await auth.complete({ state, binding: readCookie(request, BINDING_COOKIE),
        code: url.searchParams.get('code'), denied: url.searchParams.has('error'), previousSessionId: sessionId });
      response.setHeader('Set-Cookie', [...cleared, cookie(SESSION_COOKIE, session.id, sessionTtlSeconds, secure)]);
      logger.info('auth.session_created', { module: 'auth', requestId, userId: session.user.id });
      response.writeHead(302, { Location: `${webOrigin}/` }).end();
    } catch (error) {
      // Somente classificação; mensagens externas e query OAuth nunca entram em logs.
      logger[error.statusCode >= 500 || !error.statusCode ? 'error' : 'warn']('auth.discord_callback_failed', { module: 'auth', requestId, statusCode: error.statusCode || 500 });
      response.writeHead(302, { Location: `${webOrigin}/?authError=login_failed` }).end();
    }
    return true;
  }
  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    const session = auth.sessions.get(sessionId);
    sendJson(response, session ? 200 : 401, session ? { user: session.user } : { error: 'Sessão ausente ou expirada.' });
    return true;
  }
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    requireTrustedOrigin(request, webOrigin);
    auth.sessions.remove(sessionId);
    logger.info('auth.logout', { module: 'auth', requestId });
    response.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0, secure));
    response.writeHead(204).end();
    return true;
  }
  return false;
}

module.exports = { handle, SESSION_COOKIE };
