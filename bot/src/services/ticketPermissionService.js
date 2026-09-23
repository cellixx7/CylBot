const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const { clientError } = require('../api/http/errors');
const { setTicketStage } = require('../lib/ticketDiagnostics');
const TICKET_PERMISSION = Object.freeze({ CONFIGURE: 'CONFIGURE', CLAIM: 'CLAIM', CLOSE: 'CLOSE', REOPEN: 'REOPEN', DELETE_CHANNEL: 'DELETE_CHANNEL' });
class TicketPermissionService {
  constructor(adapter) { this.adapter = adapter; }
  async actor(guildId, userId) {
    setTicketStage('permission.actor');
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
  async requireAction(action, guildId, userId, config, ticket) {
    if (action === TICKET_PERMISSION.CONFIGURE) return this.requireAdmin(guildId, userId);
    if (action === TICKET_PERMISSION.CLOSE) return this.requireClose(guildId, userId, config, ticket);
    if ([TICKET_PERMISSION.CLAIM, TICKET_PERMISSION.REOPEN, TICKET_PERMISSION.DELETE_CHANNEL].includes(action)) {
      return this.requireStaff(guildId, userId, config);
    }
    throw clientError(403, 'Ação de ticket não autorizada.');
  }
}
module.exports = { TicketPermissionService, TICKET_PERMISSION };
