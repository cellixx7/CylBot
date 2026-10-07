const { codedClientError } = require('../api/http/errors');
const PLANS = Object.freeze([
  Object.freeze({ id: 'PLUS', name: 'CYL Plus', scope: 'user' }),
  Object.freeze({ id: 'COMMUNITY', name: 'CYL Comunidade', scope: 'guild' }),
]);
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
function communityRequired() {
  return codedClientError(403, 'COMMUNITY_PLAN_REQUIRED', 'Este servidor precisa ter o CYL Comunidade ativo para usar avisos e atualizações.');
}
class PlanService {
  constructor(repository, { now = Date.now } = {}) { this.repository = repository; this.now = now; }
  async personal(userId) {
    const subscriptions = this.repository ? await this.repository.forUser(userId) : [];
    return { plans: PLANS, subscriptions: subscriptions.filter(s => s.status === 'ACTIVE' && Date.parse(s.expiresAt) > this.now()) };
  }
  async requireCommunityGuild(guildId) {
    const subscription = this.repository && await this.repository.forGuild(guildId);
    if (!subscription || subscription.plan !== 'COMMUNITY' || subscription.status !== 'ACTIVE' || !(Date.parse(subscription.expiresAt) > this.now())) throw communityRequired();
    return subscription;
  }
  async activate(userId, guildId) {
    if (!snowflake(userId) || !snowflake(guildId)) throw codedClientError(400, 'INVALID_PLAN_ID', 'Informe IDs válidos de usuário e servidor.');
    if (!this.repository) throw communityRequired();
    return this.repository.activate(userId, guildId);
  }
  async deactivate(userId, guildId) {
    if (!snowflake(userId) || !snowflake(guildId)) throw codedClientError(400, 'INVALID_PLAN_ID', 'Informe IDs válidos de usuário e servidor.');
    if (!this.repository) throw communityRequired();
    return this.repository.deactivate(userId, guildId);
  }
}
module.exports = { PlanService, PLANS, snowflake, communityRequired };
