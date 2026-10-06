const { clientError, codedClientError } = require('../api/http/errors');

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
  constructor({ provider, client, ticketConfigs = null, ticketRepository = null, ticketPermissions = null, now = Date.now, guildCacheMs = 0 }) {
    Object.assign(this, { provider, client, ticketConfigs, ticketRepository, ticketPermissions, now, guildCacheMs });
    this.pendingGuilds = new WeakMap();
    this.guildCache = new WeakMap();
    this.guildCooldown = new WeakMap();
  }

  cachedActor(guild, userId) {
    const discordGuild = this.client.guilds.cache.get(guild.id);
    const member = discordGuild?.members?.me?.id === userId
      ? discordGuild.members.me
      : discordGuild?.members?.cache?.get(userId);
    const roleIds = member?.roles?.cache ? [...member.roles.cache.keys()] : [];
    const memberPermissions = permissionBitfield(member?.permissions?.bitfield);
    const guildPermissions = permissionBitfield(guild.permissions);
    return {
      id: userId,
      bot: Boolean(member?.user?.bot),
      owner: guild.owner === true,
      // OAuth guild permissions are authoritative for guild-level admin access;
      // merge them with the cached member to avoid a stale cache causing a false 403.
      permissions: (memberPermissions | guildPermissions).toString(),
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
        ticketing: { enabled, total: current?.total ?? 0, open: current?.open ?? 0, closed: current?.closed ?? 0, concluded: current?.concluded ?? 0 },
      }];
    }));
  }

  async guilds(session) {
    if (!Array.isArray(session.discordScopes) || !session.discordScopes.includes('guilds') || !session.discordAccessToken ||
        !Number.isFinite(session.discordTokenExpiresAt) || session.discordTokenExpiresAt <= this.now()) {
      throw clientError(401, 'AUTH_RELOGIN_REQUIRED');
    }
    if (!this.client.isReady()) throw clientError(503, 'O CylBot está conectando. Tente novamente em instantes.');
    const cached = this.guildCache.get(session);
    if (this.guildCacheMs > 0 && cached && cached.accessToken === session.discordAccessToken && cached.expiresAt > this.now()) return this.guildDtos(session, cached.guilds);
    const cooldown = this.guildCooldown.get(session);
    if (cooldown && cooldown.accessToken === session.discordAccessToken && cooldown.expiresAt > this.now()) {
      if (cached?.accessToken === session.discordAccessToken) return this.guildDtos(session, cached.guilds);
      throw cooldown.error;
    }
    // Share only an unfinished read for this exact session/token, never a stale grant.
    let pending = this.pendingGuilds.get(session);
    if (!pending || pending.accessToken !== session.discordAccessToken) {
      pending = { accessToken: session.discordAccessToken };
      pending.promise = Promise.resolve().then(() => this.provider.getCurrentUserGuilds(pending.accessToken))
        .then(guilds => { if (this.guildCacheMs > 0) this.guildCache.set(session, { accessToken: pending.accessToken, guilds, expiresAt: this.now() + this.guildCacheMs }); return guilds; })
        .catch(error => {
          if (error?.statusCode === 429 && Number.isFinite(error.retryAfter) && error.retryAfter > 0) {
            this.guildCooldown.set(session, { accessToken: pending.accessToken, error, expiresAt: this.now() + error.retryAfter * 1000 });
          }
          throw error;
        })
        .finally(() => { if (this.pendingGuilds.get(session) === pending) this.pendingGuilds.delete(session); });
      this.pendingGuilds.set(session, pending);
    }
    const guilds = await pending.promise;
    return this.guildDtos(session, guilds);
  }

  // The cache stores OAuth guilds, never Dashboard DTOs. Every read must derive
  // botInstalled and capabilities from the current Discord client, including
  // cache hits and the rate-limit fallback.
  async guildDtos(session, guilds) {
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
        ticketing: ticket?.ticketing ?? { enabled: false, total: 0, open: 0, closed: 0, concluded: 0 },
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
    if (!guild) throw codedClientError(403, 'GUILD_MEMBERSHIP_REQUIRED', 'Você não participa mais deste servidor.');
    if (!guild.botInstalled) throw codedClientError(403, 'GUILD_NOT_FOUND', 'O servidor não está disponível para o CylBot.');
    return guild;
  }
}

module.exports = { DashboardService, canManageGuild };
