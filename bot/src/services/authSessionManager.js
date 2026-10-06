const { randomBytes } = require('node:crypto');
const { clientError } = require('../api/http/errors');
const { logger } = require('../lib/logger');

class AuthSessionManager {
  constructor({ ttlSeconds = 2592000, now = Date.now, repository, provider } = {}) {
    this.ttlSeconds = ttlSeconds;
    this.now = now;
    this.sessions = new Map();
    this.repository = repository; this.provider = provider; this.pending = new Map(); this.lastCleanup = 0;
  }
  create(user, token) {
    this.cleanupExpired();
    if (this.sessions.size >= 10000) throw clientError(503, 'Limite temporário de sessões. Tente mais tarde.');
    const id = randomBytes(32).toString('base64url');
    const session = { id, user: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
      discordAccessToken: token.access_token, discordRefreshToken: token.refresh_token,
      discordScopes: typeof token.scope === 'string' ? token.scope.split(/\s+/).filter(Boolean) : [],
      discordTokenExpiresAt: this.now() + token.expires_in * 1000,
      expiresAt: this.now() + this.ttlSeconds * 1000 };
    this.sessions.set(id, session);
    if (this.repository) return this.repository.create(session).then(() => session).catch(error => { this.sessions.delete(id); throw error; });
    return session;
  }
  async authenticate(id) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(id || '')) return null;
    if (this.pending.has(id)) return this.pending.get(id);
    const operation = this.loadAndRefresh(id);
    this.pending.set(id, operation);
    try { return await operation; } finally { this.pending.delete(id); }
  }
  async loadAndRefresh(id) {
    let session = this.repository ? await this.repository.get(id) : this.sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= this.now()) { await this.remove(id); logger.info('auth.session_expired', { module: 'auth', userId: session.user.id }); throw clientError(401, 'SESSION_EXPIRED'); }
    if (session.discordTokenExpiresAt <= this.now() + 120000) {
      if (!session.discordRefreshToken) { await this.remove(id); throw clientError(401, 'AUTH_RELOGIN_REQUIRED'); }
      try {
        const token = await this.provider.refreshToken(session.discordRefreshToken);
        session = { ...session, discordAccessToken: token.access_token, discordRefreshToken: token.refresh_token || session.discordRefreshToken,
          discordTokenExpiresAt: this.now() + token.expires_in * 1000 };
        if (this.repository && !await this.repository.save(session)) throw clientError(401, 'AUTH_RELOGIN_REQUIRED');
        logger.info('auth.oauth_token_refreshed', { module: 'auth', userId: session.user.id });
      } catch (error) { if (error.statusCode === 401) await this.remove(id); throw error; }
    }
    this.sessions.set(id, session);
    if (this.repository && this.now() - this.lastCleanup > 3600000) { this.lastCleanup = this.now(); await this.repository.cleanup(); }
    return session;
  }
  get(id) {
    this.cleanupExpired();
    return this.sessions.get(id);
  }
  remove(id) { this.sessions.delete(id); return this.repository?.remove(id); }
  cleanupExpired() {
    for (const [id, session] of this.sessions) if (session.expiresAt <= this.now()) this.sessions.delete(id);
  }
}

module.exports = { AuthSessionManager };
