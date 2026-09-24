const { sendJson } = require('../http/json');
const { cookie, readCookie } = require('../http/cookies');
const { SESSION_COOKIE } = require('./authRoutes');
const { logger } = require('../../lib/logger');
const { requireSession } = require('../http/auth');

async function handle(request, response, { services, requestId }) {
  const url = new URL(request.url, 'http://localhost');
  if (request.method !== 'GET' || url.pathname !== '/api/dashboard/guilds') return false;
  response.setHeader('Cache-Control', 'no-store');
  const { auth, dashboard } = services;
  const sessionId = readCookie(request, SESSION_COOKIE);
  let session;
  function relogin(reason) {
    auth.sessions.remove(sessionId);
    response.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0, auth.config.secure));
    logger.warn('dashboard.relogin_required', { module: 'dashboard', requestId, userId: session?.user.id,
      hasSessionCookie: Boolean(sessionId), reason, origin: request.headers?.origin || 'missing' });
    sendJson(response, 401, { error: 'AUTH_RELOGIN_REQUIRED' });
  }
  try { session = requireSession(request, services, 'AUTH_RELOGIN_REQUIRED'); }
  catch { relogin('session_missing'); return true; }
  try {
    // Query/body não fornecem identidade, token ou permissões ao service.
    const guilds = await dashboard.guilds(session);
    if (auth.sessions.get(sessionId) !== session || session.discordTokenExpiresAt <= auth.sessions.now()) {
      relogin(); return true;
    }
    logger.info('dashboard.guilds_loaded', { module: 'dashboard', requestId, userId: session.user.id,
      guildCount: guilds.length, installedCount: guilds.filter(guild => guild.botInstalled).length,
      manageableCount: guilds.filter(guild => guild.canManage).length });
    sendJson(response, 200, { guilds });
  } catch (error) {
    if (error.statusCode === 401) {
      const reason = !Array.isArray(session.discordScopes) || !session.discordScopes.includes('guilds')
        ? 'scope_guilds_missing'
        : session.discordTokenExpiresAt <= auth.sessions.now() ? 'discord_token_expired' : 'discord_token_rejected';
      relogin(reason);
    }
    else {
      const statusCode = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode : 500;
      if (Number.isFinite(error.retryAfter) && error.retryAfter > 0) response.setHeader('Retry-After', String(Math.ceil(error.retryAfter)));
      logger[statusCode >= 500 ? 'error' : 'warn']('dashboard.guilds_failed', { module: 'dashboard', requestId, userId: session.user.id, statusCode,
        code: error.code, retryAfter: error.retryAfter });
      sendJson(response, statusCode, { error: statusCode === 503
        ? 'O CylBot está conectando. Tente novamente em instantes.'
        : 'Não foi possível carregar seus servidores. Tente novamente.' });
    }
  }
  return true;
}

module.exports = { handle };
