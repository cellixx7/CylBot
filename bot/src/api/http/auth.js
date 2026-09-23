const { readCookie, cookie } = require('./cookies');
const { clientError } = require('./errors');

function requireSession(request, services, message = 'AUTH_REQUIRED') {
  const id = readCookie(request, 'cylbot_session');
  const session = services.auth.sessions.get(id);
  if (!session) throw clientError(401, message);
  return session;
}

function requireTrustedOrigin(request, allowedOrigins) {
  const origin = request.headers?.origin;
  if (typeof origin !== 'string' || !allowedOrigins.includes(origin)) {
    throw clientError(403, 'FORBIDDEN');
  }
}

function clearSession(request, response, services) {
  services.auth.sessions.remove(readCookie(request, 'cylbot_session'));
  response.setHeader('Set-Cookie', cookie('cylbot_session', '', 0, services.auth.config.secure));
}

module.exports = { requireSession, requireTrustedOrigin, clearSession };
