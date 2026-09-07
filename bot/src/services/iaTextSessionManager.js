const crypto = require('node:crypto');

const SESSION_TTL_MS = 10 * 60 * 1000;

class IaTextSessionManager {
  constructor() {
    this.sessions = new Map();
  }

  create(data) {
    this.removeExpired();
    const id = crypto.randomBytes(12).toString('hex');
    this.sessions.set(id, {
      ...data,
      id,
      status: 'active',
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return id;
  }

  get(id, userId) {
    const session = this.sessions.get(id);

    if (!session || session.expiresAt <= Date.now() || session.userId !== userId) {
      if (session?.expiresAt <= Date.now()) this.sessions.delete(id);
      return null;
    }

    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return session;
  }

  getStatus(id, userId) {
    const session = this.sessions.get(id);

    if (!session || session.expiresAt <= Date.now() || session.userId !== userId) {
      return null;
    }

    return session.status;
  }

  remove(id) {
    this.sessions.delete(id);
  }

  claim(id, userId) {
    const session = this.get(id, userId);

    if (!session || session.status !== 'active') {
      return null;
    }

    session.status = 'processing';
    return session;
  }

  beginCorrection(id, userId) {
    const session = this.get(id, userId);

    if (!session || session.status !== 'active') {
      return null;
    }

    session.status = 'awaiting_correction';
    return session;
  }

  claimCorrection(id, userId) {
    const session = this.get(id, userId);

    if (!session || session.status !== 'awaiting_correction') {
      return null;
    }

    session.status = 'processing';
    return session;
  }

  markSent(id, userId) {
    const session = this.get(id, userId);

    if (!session || session.status !== 'processing') {
      return false;
    }

    session.status = 'sent';
    this.remove(id);
    return true;
  }

  release(id, userId) {
    const session = this.get(id, userId);

    if (session?.status === 'processing') {
      session.status = 'active';
      return session;
    }

    return null;
  }

  removeExpired() {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= Date.now()) this.sessions.delete(id);
    }
  }
}

module.exports = IaTextSessionManager;