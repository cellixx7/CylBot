const { requireSession } = require('../../api/http/auth');
const { readJson, sendJson } = require('../../api/http/json');
const { clientError } = require('../../api/http/errors');
const route = /^\/api\/tickets\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/tools(?:\/(add-role|remove-role|timeout|remove-timeout|ban))?$/;
async function handle(request, response, { services }) {
  const url = new URL(request.url, 'http://localhost');
  const match = url.pathname.match(route);
  if (!match) return false;
  const [, ticketId, action] = match;
  if (request.method !== (action ? 'POST' : 'GET')) throw clientError(405, 'Método não permitido.');
  const session = requireSession(request, services);
  response.setHeader('Cache-Control', 'no-store');
  const body = action ? await readJson(request) : { guildId: url.searchParams.get('guildId') };
  const allowed = ['guildId', 'reason', 'confirm', ...(['add-role', 'remove-role'].includes(action) ? ['roleId'] : action === 'timeout' ? ['durationMs'] : [])];
  if (!/^\d{17,20}$/.test(body.guildId || '') || Object.keys(body).some(key => !allowed.includes(key))) throw clientError(400, 'Parâmetros da ferramenta inválidos.');
  await services.dashboard.requireGuildMembership(session, body.guildId);
  requireSession(request, services);
  const input = { ...body, ticketId, userId: session.user.id, action };
  const result = action ? await services.ticketTools.execute(input) : { tools: await services.ticketTools.read(input) };
  requireSession(request, services);
  sendJson(response, 200, result);
  return true;
}
module.exports = { handle };
