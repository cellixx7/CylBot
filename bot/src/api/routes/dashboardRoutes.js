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
  function relogin() {
    auth.sessions.remove(sessionId);
    response.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0, auth.config.secure));
    logger.info('dashboard.relogin_required', { module: 'dashboard', requestId, userId: session?.user.id });
    sendJson(response, 401, { error: 'AUTH_RELOGIN_REQUIRED' });
  }
  try { session = requireSession(request, services, 'AUTH_RELOGIN_REQUIRED'); }
  catch { relogin(); return true; }
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
    if (error.statusCode === 401) relogin();
    else {
      const statusCode = error.statusCode === 503 ? 503 : 502;
      logger.warn('dashboard.guilds_failed', { module: 'dashboard', requestId, userId: session.user.id, statusCode });
      sendJson(response, statusCode, { error: statusCode === 503
        ? 'O CylBot está conectando. Tente novamente em instantes.'
        : 'Não foi possível carregar seus servidores. Tente novamente.' });
    }
  }
  return true;
}

module.exports = { handle };
