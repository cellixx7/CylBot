const { readJson, sendJson } = require('../http/json');
const { requireSession } = require('../http/auth');
const { codedClientError } = require('../http/errors');
const { requireGuildAdministrator } = require('../../services/announcementAccessService');
const { PLANS, snowflake } = require('../../services/planService');
async function handle(request, response, { client, services }) {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/api/plans' && request.method === 'GET') { sendJson(response, 200, { plans: PLANS }); return true; }
  if (!path.startsWith('/api/plans/')) return false;
  response.setHeader('Cache-Control', 'no-store');
  const session = requireSession(request, services);
  if (path === '/api/plans/me' && request.method === 'GET') { sendJson(response, 200, await services.plans.personal(session.user.id)); return true; }
  if (path === '/api/plans/community/guilds' && ['POST', 'DELETE'].includes(request.method)) {
    const body = await readJson(request);
    if (!snowflake(body.guildId)) throw codedClientError(400, 'INVALID_PLAN_ID', 'Informe um ID de servidor válido.');
    if (request.method === 'POST') await requireGuildAdministrator(client, body.guildId, session.user.id);
    const result = await services.plans[request.method === 'POST' ? 'activate' : 'deactivate'](session.user.id, body.guildId);
    sendJson(response, 200, result); return true;
  }
  return false;
}
module.exports = { handle };
