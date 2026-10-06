const { requireSession } = require('../../api/http/auth');
const { readJson, sendJson } = require('../../api/http/json');
const { clientError } = require('../../api/http/errors');
const { ticketActions, ticketDto } = require('../services/ticketReadService');
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const route = new RegExp(`^/api/tickets/(${UUID})/actions/(claim|close|conclude|reopen)$`);
const validGuildId = value => /^\d{17,20}$/.test(value || '');
async function handle(request, response, { services }) {
  const match = new URL(request.url, 'http://localhost').pathname.match(route);
  if (!match) return false;
  if (request.method !== 'POST') throw clientError(405, 'Método não permitido.');
  const session = requireSession(request, services);
  response.setHeader('Cache-Control', 'no-store');
  const body = await readJson(request); const [, ticketId, action] = match;
  const finishing = ['close', 'conclude'].includes(action);
  const allowed = finishing ? ['guildId', 'reason', 'summary'] : ['guildId'];
  if (Object.keys(body).some(key => !allowed.includes(key)) || !validGuildId(body.guildId) ||
    finishing && (action === 'close' && typeof body.reason !== 'string' || body.reason !== undefined && typeof body.reason !== 'string' || body.summary !== undefined && typeof body.summary !== 'string')) throw clientError(400, 'Corpo da ação inválido.');
  await services.dashboard.requireGuildMembership(session, body.guildId); requireSession(request, services);
  const ticket = await services.tickets.ticket(body.guildId, ticketId);
  const input = { guildId: body.guildId, ticketId, userId: session.user.id };
  const updated = action === 'claim' ? await services.tickets.claim({ ...input, channelId: ticket.channelId })
    : action === 'close' ? await services.tickets.close({ ...input, channelId: ticket.channelId, reason: body.reason, summary: body.summary || '' })
      : action === 'conclude' ? await services.tickets.conclude({ ...input, channelId: ticket.channelId, reason: body.reason, summary: body.summary || '' })
      : await services.tickets.reopen({ ...input, channelId: ticket.logChannelId, cycle: ticket.reopenCount });
  const actor = await services.tickets.permissions.actor(body.guildId, session.user.id);
  requireSession(request, services);
  sendJson(response, 200, { ticket: ticketDto(updated, ticketActions(updated, actor, services.tickets.permissions)) }); return true;
}
module.exports = { handle };
