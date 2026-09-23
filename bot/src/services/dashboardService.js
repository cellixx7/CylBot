const { clientError } = require('../api/http/errors');

const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

function canManageGuild(guild) {
  if (guild.owner === true) return true;
  // Não converte números JS (potencialmente truncados), negativos ou formatos alternativos.
  if (typeof guild.permissions !== 'string' || !/^\d{1,40}$/.test(guild.permissions)) return false;
  const permissions = BigInt(guild.permissions);
  return (permissions & (ADMINISTRATOR | MANAGE_GUILD)) !== 0n;
}

class DashboardService {
  constructor({ provider, client, now = Date.now }) {
    Object.assign(this, { provider, client, now });
  }

  async guilds(session) {
    if (!Array.isArray(session.discordScopes) || !session.discordScopes.includes('guilds') || !session.discordAccessToken ||
        !Number.isFinite(session.discordTokenExpiresAt) || session.discordTokenExpiresAt <= this.now()) {
      throw clientError(401, 'AUTH_RELOGIN_REQUIRED');
    }
    if (!this.client.isReady()) throw clientError(503, 'O CylBot está conectando. Tente novamente em instantes.');
    const guilds = await this.provider.getCurrentUserGuilds(session.discordAccessToken);
    if (!this.client.isReady()) throw clientError(503, 'O CylBot está conectando. Tente novamente em instantes.');
    const result = guilds.map(guild => ({
      id: guild.id, name: guild.name,
      iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith('a_') ? 'gif' : 'png'}` : null,
      botInstalled: this.client.guilds.cache.has(guild.id),
      canManage: canManageGuild(guild), owner: guild.owner === true,
    }));
    const group = guild => guild.botInstalled ? (guild.canManage ? 0 : 1) : 2;
    const names = new Intl.Collator('pt-BR', { sensitivity: 'base' });
    return result.sort((a, b) => group(a) - group(b) || names.compare(a.name, b.name) || a.id.localeCompare(b.id));
  }

  async requireManageableGuild(session, guildId) {
    const guild = (await this.guilds(session)).find(guild => guild.id === guildId);
    if (!guild?.botInstalled || !guild.canManage) throw clientError(403, 'FORBIDDEN');
    return guild;
  }

  async requireGuildMembership(session, guildId) {
    const guild = (await this.guilds(session)).find(guild => guild.id === guildId);
    if (!guild?.botInstalled) throw clientError(403, 'FORBIDDEN');
    return guild;
  }
}

module.exports = { DashboardService, canManageGuild };
