const { sendJson } = require('../http/json');

async function handle(request, response, { services } = {}) {
  if (request.method !== 'GET' || new URL(request.url, 'http://localhost').pathname !== '/api/health') return false;
  if (!services?.database) {
    sendJson(response, 200, { ok: true });
    return true;
  }
  try {
    await services.database.ping();
    sendJson(response, 200, { ok: true, database: 'ok' });
  } catch {
    sendJson(response, 503, { ok: false, database: 'unavailable' });
  }
  return true;
}

module.exports = { handle };
