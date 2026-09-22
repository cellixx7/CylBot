const { readCookie, cookie } = require('./cookies');
const { clientError } = require('./errors');

function requireSession(request, services, message = 'AUTH_REQUIRED') {
  const id = readCookie(request, 'cylbot_session');
  const session = services.auth.sessions.get(id);
  if (!session) throw clientError(401, message);
  return session;
}

function requireTrustedOrigin(request, webOrigin) {
  const origin = request.headers?.origin;
  const codespacesOrigin = /^https:\/\/[a-z0-9-]+-5173\.app\.github\.dev$/i;
  const localOrigin = /^http:\/\/(localhost|127\.0\.0\.1):5173$/i;
  if (origin !== webOrigin && !codespacesOrigin.test(origin || '') && !localOrigin.test(origin || '')) {
    throw clientError(403, 'FORBIDDEN');
  }
}

function clearSession(request, response, services) {
  services.auth.sessions.remove(readCookie(request, 'cylbot_session'));
  response.setHeader('Set-Cookie', cookie('cylbot_session', '', 0, services.auth.config.secure));
}

module.exports = { requireSession, requireTrustedOrigin, clearSession };
