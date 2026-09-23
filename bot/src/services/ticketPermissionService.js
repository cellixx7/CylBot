const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const { clientError } = require('../api/http/errors');
class TicketPermissionService {
  constructor(adapter) { this.adapter = adapter; }
  async actor(guildId, userId) {
    if (!/^\d{17,20}$/.test(guildId || '') || !/^\d{17,20}$/.test(userId || '')) throw clientError(400, 'Use esta ação em um servidor válido.');
    const actor = await this.adapter.getActor(guildId, userId);
    if (!actor || actor.bot) throw clientError(403, 'Você não possui permissão para esta ação.');
    return actor;
  }
  admin(actor) { return new PermissionsBitField(actor.permissions).has(P.ManageGuild); }
  staff(actor, config) { return this.admin(actor) || config.supportRoleIds.some(id => actor.roleIds.includes(id)); }
  async requireAdmin(guildId, userId) {
    const actor = await this.actor(guildId, userId);
    if (!this.admin(actor)) throw clientError(403, 'Você precisa de Gerenciar Servidor para configurar tickets.');
    return actor;
  }
  async requireStaff(guildId, userId, config) {
    const actor = await this.actor(guildId, userId);
    if (!this.staff(actor, config)) throw clientError(403, 'Somente a equipe de suporte pode executar esta ação.');
    return actor;
  }
  async requireClose(guildId, userId, config, ticket) {
    const actor = await this.actor(guildId, userId);
    if (actor.id !== ticket.creatorUserId && !this.staff(actor, config)) throw clientError(403, 'Somente o criador ou a equipe pode fechar este ticket.');
    return actor;
  }
}
module.exports = { TicketPermissionService };
