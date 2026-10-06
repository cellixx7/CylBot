const { requireSession } = require('../../api/http/auth');
const { sendJson } = require('../../api/http/json');
const { clientError } = require('../../api/http/errors');
const { ticketFilters } = require('../services/ticketFilters');
const { logGuildRead } = require('../../api/http/guildDiagnostics');

async function handle(request, response, { services, client, requestId }) {
  const url = new URL(request.url, 'http://localhost');
  const detail = url.pathname.match(/^\/api\/tickets\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/);
  if (url.pathname !== '/api/tickets' && !detail) return false;
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') throw clientError(405, 'Método não permitido.');
  const session = requireSession(request, services);
  const guildId = url.searchParams.get('guildId');
  if (!/^\d{17,20}$/.test(guildId || '')) throw clientError(400, 'Servidor inválido.');
  const rawLimit = url.searchParams.get('limit');
  const rawBefore = url.searchParams.get('before');
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  const before = rawBefore === null ? undefined : Number(rawBefore);
  if (!detail && (!/^\d+$/.test(rawLimit ?? '25') || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
    rawBefore !== null && (!/^\d+$/.test(rawBefore) || !Number.isInteger(before) || before < 1 || before > 2147483647))) {
    throw clientError(400, 'Paginação inválida.');
  }
  let guild;
  try {
    guild = await services.dashboard.requireGuildMembership(session, guildId);
    logGuildRead('tickets.guild_state', { services, client, requestId, guildId, guild, stage: 'membership', result: 'allowed' });
  } catch (error) {
    logGuildRead('tickets.guild_state', { services, client, requestId, guildId, stage: 'membership', result: 'denied', code: error.code });
    throw error;
  }
  requireSession(request, services);
  const input = { guildId, userId: session.user.id };
  let result;
  try {
    result = detail
      ? await services.ticketRead.detail({ ...input, ticketId: detail[1] })
      : await services.ticketRead.list({ ...input, limit, before, filters: ticketFilters(Object.fromEntries(url.searchParams)) });
    logGuildRead('tickets.guild_state', { services, client, requestId, guildId, guild, stage: 'ticketRead', result: 'allowed' });
  } catch (error) {
    logGuildRead('tickets.guild_state', { services, client, requestId, guildId, guild, stage: 'ticketRead', result: 'denied', code: error.code });
    throw error;
  }
  requireSession(request, services);
  sendJson(response, 200, result);
  return true;
}
module.exports = { handle };
