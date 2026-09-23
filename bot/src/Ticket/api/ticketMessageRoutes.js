const { requireSession } = require('../../api/http/auth');
const { readJson, sendJson } = require('../../api/http/json');
const { clientError } = require('../../api/http/errors');

const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';

async function handle(request, response, { services }) {
  const url = new URL(request.url, 'http://localhost');
  const match = url.pathname.match(new RegExp(`^/api/tickets/(${UUID})/messages$`));
  if (!match) return false;
  if (!['GET', 'POST'].includes(request.method)) throw clientError(405, 'Método não permitido.');
  const session = requireSession(request, services);
  response.setHeader('Cache-Control', 'no-store');
  const ticketId = match[1];
  if (request.method === 'GET') {
    const guildId = url.searchParams.get('guildId');
    const before = url.searchParams.get('before') || undefined;
    const rawLimit = url.searchParams.get('limit');
    if (!/^\d{17,20}$/.test(guildId || '') || before && !new RegExp(`^${UUID}$`).test(before)) throw clientError(400, 'Parâmetros inválidos.');
    const limit = rawLimit == null ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw clientError(400, 'limit deve estar entre 1 e 100.');
    await services.dashboard.requireGuildMembership(session, guildId);
    requireSession(request, services);
    sendJson(response, 200, await services.ticketMessages.list({ guildId, ticketId, userId: session.user.id, limit, before }));
    return true;
  }
  const body = await readJson(request);
  if (Object.keys(body).some(key => !['guildId', 'clientMessageId', 'content'].includes(key)) || !/^\d{17,20}$/.test(body.guildId || '')) {
    throw clientError(400, 'Corpo de mensagem inválido.');
  }
  await services.dashboard.requireGuildMembership(session, body.guildId);
  requireSession(request, services);
  const message = await services.ticketMessages.createWebMessage({ guildId: body.guildId, ticketId, userId: session.user.id,
    clientMessageId: body.clientMessageId, content: body.content });
  sendJson(response, 200, { message: services.ticketMessages.dto(message) });
  return true;
}

module.exports = { handle };
