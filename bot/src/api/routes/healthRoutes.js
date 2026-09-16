const { sendJson } = require('../http/json');

async function handle(request, response) {
  if (request.method !== 'GET' || request.url !== '/api/health') return false;
  sendJson(response, 200, { ok: true });
  return true;
}

module.exports = { handle };
