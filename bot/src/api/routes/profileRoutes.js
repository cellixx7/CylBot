const { requireSession } = require('../http/auth');
const { readJson, sendJson } = require('../http/json');
const { codedClientError } = require('../http/errors');
async function handle(request, response, { services, client }) {
  const url = new URL(request.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/profile/')) return false;
  const session = requireSession(request, services); response.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/api/profile/communities' && request.method === 'GET') {
    if (!session.discordScopes?.includes('guilds') || !session.discordAccessToken || session.discordTokenExpiresAt <= Date.now()) throw codedClientError(401, 'AUTH_RELOGIN_REQUIRED', 'Entre novamente com Discord para consultar suas comunidades.');
    const guilds = await services.dashboard.provider.getCurrentUserGuilds(session.discordAccessToken);
    sendJson(response, 200, { communities: guilds.filter(g => client.guilds.cache.has(g.id)).map(g => ({ id: g.id, name: g.name })) }); return true;
  }
  if (url.pathname === '/api/profile/me' && request.method === 'PATCH') {
    await services.profiles.update(session.user.id, await readJson(request));
    sendJson(response, 200, await services.profiles.get({ viewerId: session.user.id, identity: session.user })); return true;
  }
  const match = url.pathname.match(/^\/api\/profile\/(me|\d{17,20})$/);
  if (match && request.method === 'GET') {
    sendJson(response, 200, await services.profiles.get({ viewerId: session.user.id,
      userId: match[1] === 'me' ? session.user.id : match[1], guildId: url.searchParams.get('guildId') || undefined, identity: session.user })); return true;
  }
  return false;
}
module.exports = { handle };
