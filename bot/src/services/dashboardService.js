const { clientError } = require('../api/http/errors');

const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

function permissionBitfield(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^\d{1,40}$/.test(value)) return BigInt(value);
  if (value && typeof value === 'object' && typeof value.toString === 'function') {
    const stringValue = value.toString();
    if (/^\d{1,40}$/.test(stringValue)) return BigInt(stringValue);
  }
  return 0n;
}

function canManageGuild(guild) {
  if (guild.owner === true) return true;
  // Não converte números JS (potencialmente truncados), negativos ou formatos alternativos.
  if (typeof guild.permissions !== 'string' || !/^\d{1,40}$/.test(guild.permissions)) return false;
  const permissions = BigInt(guild.permissions);
  return (permissions & (ADMINISTRATOR | MANAGE_GUILD)) !== 0n;
}

class DashboardService {
  constructor({ provider, client, ticketConfigs = null, ticketRepository = null, ticketPermissions = null, now = Date.now }) {
    Object.assign(this, { provider, client, ticketConfigs, ticketRepository, ticketPermissions, now });
    this.pendingGuilds = new WeakMap();
  }

  cachedActor(guild, userId) {
    const discordGuild = this.client.guilds.cache.get(guild.id);
    const member = discordGuild?.members?.me?.id === userId
      ? discordGuild.members.me
      : discordGuild?.members?.cache?.get(userId);
    const roleIds = member?.roles?.cache ? [...member.roles.cache.keys()] : [];
    return {
      id: userId,
      bot: Boolean(member?.user?.bot),
      permissions: member?.permissions?.bitfield?.toString?.() || guild.permissions || '0',
      roleIds,
    };
  }

  botPermissionState(guild) {
    const discordGuild = this.client.guilds.cache.get(guild.id);
    const member = discordGuild?.members?.me || (this.client.user?.id && discordGuild?.members?.cache?.get(this.client.user.id));
    if (!member) return 'unknown';
    const permissions = permissionBitfield(member.permissions?.bitfield ?? member.permissions);
    return (permissions & ADMINISTRATOR) !== 0n ? 'ok' : 'limited';
  }

  async ticketData(guilds, userId) {
    const installed = guilds.filter(guild => guild.botInstalled);
    const ids = installed.map(guild => guild.id);
    if (!this.ticketConfigs || !this.ticketRepository || !this.ticketPermissions) return null;
    const configs = this.ticketConfigs.getMany
      ? await this.ticketConfigs.getMany(ids)
      : await Promise.all(ids.map(id => this.ticketConfigs.get(id)));
    const configByGuild = new Map(configs.filter(Boolean).map(config => [config.guildId, config]));
    const stats = this.ticketRepository.getStatsByGuildIds
      ? await this.ticketRepository.getStatsByGuildIds(ids)
      : new Map();
    return new Map(installed.map(guild => {
      const config = configByGuild.get(guild.id);
      const enabled = Boolean(config?.ready);
      const actor = this.cachedActor(guild, userId);
      const canViewTickets = enabled && !actor.bot && this.ticketPermissions.staff(actor, config);
      const current = stats instanceof Map ? stats.get(guild.id) : stats?.[guild.id];
      return [guild.id, {
        canViewTickets,
        ticketing: { enabled, total: current?.total ?? 0, open: current?.open ?? 0, closed: current?.closed ?? 0 },
      }];
    }));
  }

  async guilds(session) {
    if (!Array.isArray(session.discordScopes) || !session.discordScopes.includes('guilds') || !session.discordAccessToken ||
        !Number.isFinite(session.discordTokenExpiresAt) || session.discordTokenExpiresAt <= this.now()) {
      throw clientError(401, 'AUTH_RELOGIN_REQUIRED');
    }
    if (!this.client.isReady()) throw clientError(503, 'O CylBot está conectando. Tente novamente em instantes.');
    // Share only an unfinished read for this exact session/token, never a stale grant.
    let pending = this.pendingGuilds.get(session);
    if (!pending || pending.accessToken !== session.discordAccessToken) {
      pending = { accessToken: session.discordAccessToken };
      pending.promise = Promise.resolve().then(() => this.provider.getCurrentUserGuilds(pending.accessToken))
        .finally(() => { if (this.pendingGuilds.get(session) === pending) this.pendingGuilds.delete(session); });
      this.pendingGuilds.set(session, pending);
    }
    const guilds = await pending.promise;
    if (session.discordTokenExpiresAt <= this.now()) throw clientError(401, 'AUTH_RELOGIN_REQUIRED');
    if (!this.client.isReady()) throw clientError(503, 'O CylBot está conectando. Tente novamente em instantes.');
    const base = guilds.map(guild => ({
      id: guild.id, name: guild.name,
      iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith('a_') ? 'gif' : 'png'}` : null,
      botInstalled: this.client.guilds.cache.has(guild.id),
      canManage: canManageGuild(guild), canAddBot: canManageGuild(guild), owner: guild.owner === true,
    }));
    const ticketData = await this.ticketData(base, session.user.id);
    if (!ticketData) {
      const group = guild => guild.botInstalled ? (guild.canManage ? 0 : 1) : 2;
      const names = new Intl.Collator('pt-BR', { sensitivity: 'base' });
      return base.map(({ canAddBot, ...guild }) => guild)
        .sort((a, b) => group(a) - group(b) || names.compare(a.name, b.name) || a.id.localeCompare(b.id));
    }
    const result = base.map(guild => {
      const discordGuild = this.client.guilds.cache.get(guild.id);
      const ticket = ticketData?.get(guild.id);
      return {
        ...guild,
        memberCount: guild.botInstalled ? discordGuild?.memberCount ?? null : null,
        botPermissions: guild.botInstalled ? { state: this.botPermissionState(guild) } : { state: 'not_installed' },
        canViewTickets: ticket?.canViewTickets ?? false,
        ticketing: ticket?.ticketing ?? { enabled: false, total: 0, open: 0, closed: 0 },
      };
    }).filter(guild => !ticketData || (guild.botInstalled ? guild.canManage || guild.canViewTickets : guild.canAddBot));
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
