const { sendJson } = require('../http/json');

async function handle(request, response, { client, services } = {}) {
  if (request.method !== 'GET') return false;
  const path = new URL(request.url, 'http://localhost').pathname;

  // Liveness deliberately does not call external dependencies: the process
  // is alive even while PostgreSQL or Discord is recovering.
  if (path === '/api/health') {
    sendJson(response, 200, { ok: true });
    return true;
  }
  if (path !== '/api/ready') return false;

  if (services?.database) {
    try {
      await services.database.ping();
    } catch {
      sendJson(response, 503, { ok: false, database: 'unavailable' });
      return true;
    }
  }

  try {
    if (typeof client?.isReady !== 'function' || !client.isReady()) throw new Error('Discord indisponível.');
  } catch {
    sendJson(response, 503, { ok: false, discord: 'unavailable' });
    return true;
  }

  sendJson(response, 200, { ok: true });
  return true;
}

module.exports = { handle };
