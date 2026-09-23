const { requireSession } = require('../http/auth');
const { readJson, sendJson } = require('../http/json');
const { clientError } = require('../http/errors');
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';

async function handle(request, response, { services }) {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (!path.startsWith('/api/tickets/')) return false;
  const session = requireSession(request, services);
  response.setHeader('Cache-Control', 'no-store');
  const match = path.match(new RegExp(`^/api/tickets/ai/config/(\\d{17,20})$`));
  if (match) {
    if (!['GET', 'PUT'].includes(request.method)) throw clientError(405, 'Método não permitido.');
    const guildId = match[1];
    await services.dashboard.requireManageableGuild(session, guildId);
    requireSession(request, services);
    const input = { guildId, userId: session.user.id };
    const result = request.method === 'GET' ? await services.ticketAI.getConfig(input)
      : await services.ticketAI.configure({ ...input, config: await readJson(request) });
    sendJson(response, 200, { config: result });
    return true;
  }
  const action = path.match(new RegExp(`^/api/tickets/(${UUID})/ai/(analyze|suggest|pause|resume)$`));
  if (!action) throw clientError(404, 'Rota não encontrada.');
  if (request.method !== 'POST') throw clientError(405, 'Método não permitido.');
  const body = await readJson(request);
  if (Object.keys(body).some(key => key !== 'guildId') || !/^\d{17,20}$/.test(body.guildId || '')) throw clientError(400, 'Informe apenas guildId válido.');
  await services.dashboard.requireGuildMembership(session, body.guildId);
  requireSession(request, services);
  const input = { guildId: body.guildId, ticketId: action[1], userId: session.user.id };
  const result = ['analyze', 'suggest'].includes(action[2]) ? await services.ticketAI.analyze(input)
    : await services.ticketAI.pause({ ...input, paused: action[2] === 'pause' });
  sendJson(response, 200, result);
  return true;
}
module.exports = { handle };
