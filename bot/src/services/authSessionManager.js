const { randomBytes } = require('node:crypto');
const { clientError } = require('../api/http/errors');

class AuthSessionManager {
  constructor({ ttlSeconds = 28800, now = Date.now } = {}) {
    this.ttlSeconds = ttlSeconds;
    this.now = now;
    this.sessions = new Map();
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
    return session;
  }
  get(id) {
    this.cleanupExpired();
    return this.sessions.get(id);
  }
  remove(id) { this.sessions.delete(id); }
  cleanupExpired() {
    for (const [id, session] of this.sessions) if (session.expiresAt <= this.now()) this.sessions.delete(id);
  }
}

module.exports = { AuthSessionManager };
