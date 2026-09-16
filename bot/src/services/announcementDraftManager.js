const { clientError } = require('../api/http/errors');
const crypto = require('node:crypto');

const DRAFT_TTL_MS = 15 * 60_000;
const fail = message => clientError(400, message);

class AnnouncementDraftManager {
  constructor() {
    this.drafts = new Map();
  }

  create(data) {
    this.cleanupExpired();
    const id = crypto.randomUUID();
    this.drafts.set(id, { ...data, expires: Date.now() + DRAFT_TTL_MS, busy: false });
    return id;
  }

  get(id, owner, guildId) {
    const draft = this.drafts.get(id);
    if (!draft || draft.expires <= Date.now() || draft.owner !== owner || draft.guildId !== guildId) {
      throw fail('Prévia expirada, substituída ou indisponível. Gere uma nova prévia.');
    }
    return draft;
  }

  replace(id, data) {
    const replacementId = this.create(data);
    this.remove(id);
    return replacementId;
  }

  assertAvailable(draft) {
    if (draft.busy) throw fail('Aguarde a operação atual.');
  }

  markBusy(draft) {
    this.assertAvailable(draft);
    draft.busy = true;
  }

  release(draft) {
    // Libera também a referência de uma operação que expirou ou foi removida.
    draft.busy = false;
  }

  remove(id) {
    this.drafts.delete(id);
  }

  cleanupExpired() {
    for (const [id, draft] of this.drafts) {
      if (draft.expires <= Date.now()) this.drafts.delete(id);
    }
  }
}

module.exports = { AnnouncementDraftManager };
