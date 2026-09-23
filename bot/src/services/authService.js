const { randomBytes, timingSafeEqual } = require('node:crypto');
const { clientError } = require('../api/http/errors');

const STATE_TTL_SECONDS = 300;
class AuthService {
  constructor({ config, provider, sessions, users, now = Date.now }) {
    Object.assign(this, { config, provider, sessions, users, now });
    this.states = new Map();
  }
  assertEnabled() {
    if (!this.config.enabled) throw clientError(503, 'Login Discord não configurado.');
  }
  begin(previousState) {
    this.assertEnabled();
    for (const [id, entry] of this.states) if (entry.expiresAt <= this.now()) this.states.delete(id);
    if (previousState) this.states.delete(previousState);
    if (this.states.size >= 1000) throw clientError(503, 'Muitas tentativas de login. Tente mais tarde.');
    const state = randomBytes(32).toString('base64url');
    const binding = randomBytes(32).toString('base64url');
    this.states.set(state, { binding, expiresAt: this.now() + STATE_TTL_SECONDS * 1000 });
    return { state, binding, url: this.provider.authorizationUrl(state) };
  }
  async complete({ state, binding, code, denied, previousSessionId }) {
    this.assertEnabled();
    const entry = this.states.get(state);
    if (entry?.expiresAt <= this.now()) this.states.delete(state);
    if (!entry || entry.expiresAt <= this.now() || typeof binding !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(binding) ||
        !timingSafeEqual(Buffer.from(binding), Buffer.from(entry.binding))) {
      throw clientError(400, 'Login expirado ou inválido. Inicie novamente.');
    }
    // Consome antes de aguardar rede: callback repetido/concorrente não troca o code.
    this.states.delete(state);
    if (denied || typeof code !== 'string' || !code || code.length > 2048) {
      throw clientError(400, 'Autorização cancelada ou inválida.');
    }
    const token = await this.provider.exchangeCode(code);
    const user = await this.provider.getUser(token.access_token);
    if (this.users) await this.users.upsertDiscordUser(user);
    const session = this.sessions.create(user, token);
    this.sessions.remove(previousSessionId);
    return session;
  }
}

module.exports = { AuthService, STATE_TTL_SECONDS };
