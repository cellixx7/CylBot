const { clientError } = require('./errors');

class RateLimiter {
  constructor({ now = Date.now, windowMs = 60000, maxEntries = 10000 } = {}) {
    Object.assign(this, { now, windowMs, maxEntries });
    this.entries = new Map();
  }
  consume(key, limit) {
    const now = this.now();
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(id);
    let entry = this.entries.get(key);
    if (!entry && this.entries.size >= this.maxEntries) this.reject(this.windowMs);
    if (!entry) {
      entry = { count: 0, expiresAt: now + this.windowMs };
      this.entries.set(key, entry);
    }
    if (entry.count >= limit) this.reject(entry.expiresAt - now);
    entry.count++;
  }
  reject(remainingMs) {
    const error = clientError(429, 'Muitas requisições. Tente novamente mais tarde.');
    error.retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
    throw error;
  }
}

module.exports = { RateLimiter };
