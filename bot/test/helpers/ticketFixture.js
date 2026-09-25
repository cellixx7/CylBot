const path = require('node:path');
const { PermissionFlagsBits: P } = require('discord.js');
const { tempDirectory } = require('./tempDirectory');
const { TicketRepository } = require('../../src/Ticket/repositories/ticketRepository');
const { TicketConfigRepository } = require('../../src/Ticket/repositories/ticketConfigRepository');
const { TicketTranscriptRepository } = require('../../src/Ticket/repositories/ticketTranscriptRepository');
const { TicketPermissionService } = require('../../src/Ticket/services/ticketPermissionService');
const { TicketTranscriptService } = require('../../src/Ticket/services/ticketTranscriptService');
const { TicketSetupService } = require('../../src/Ticket/services/ticketSetupService');
const { TicketReconciliationService } = require('../../src/Ticket/services/ticketReconciliationService');
const { TicketService } = require('../../src/Ticket/services/ticketService');
const { DEFAULT_CATEGORIES } = require('../../src/Ticket/services/ticketConstants');
const ids = { guild: '111111111111111111', otherGuild: '111111111111111112', user: '222222222222222222', staff: '333333333333333333', admin: '444444444444444444', role: '555555555555555555', panel: '666666666666666666', log: '777777777777777777', category: '888888888888888888' };

function ticketFixture(t, { configured = true } = {}) {
  const dir = tempDirectory(t, 'cylbot-tickets-');
  let time = 1_700_000_000_000;
  const now = () => time;
  let channelSequence = 900000000000000000n;
  const calls = [];
  const channels = new Map();
  const logs = new Map();
  const actors = new Map([
    [ids.user, { id: ids.user, name: 'Criador', bot: false, roleIds: [], permissions: '0' }],
    [ids.staff, { id: ids.staff, name: 'Equipe', bot: false, roleIds: [ids.role], permissions: '0' }],
    [ids.admin, { id: ids.admin, name: 'Admin', bot: false, roleIds: [], permissions: P.ManageGuild.toString() }],
  ]);
  const repository = new TicketRepository(path.join(dir, 'tickets.json'));
  const configs = new TicketConfigRepository(path.join(dir, 'config.json'));
  const transcriptRepository = new TicketTranscriptRepository(path.join(dir, 'transcripts'));
  const config = { guildId: ids.guild, mode: 'existing', ready: true, supportRoleIds: [ids.role], categories: structuredClone(DEFAULT_CATEGORIES), panelChannelId: ids.panel, logChannelId: ids.log, activeCategoryId: ids.category };
  if (configured) configs.save(config);
  const adapter = {
    async getActor(guildId, userId) { calls.push('actor'); return guildId === ids.guild ? actors.get(userId) : null; },
    async guildName() { return 'Servidor de teste'; },
    async validateSetup() { calls.push('validateSetup'); },
    async validateStructure() { calls.push('validateStructure'); },
    async missingStructure() { return []; },
    async disablePanel() { calls.push('disablePanel'); },
    async ticketChannelExists(ticket) {
      const channel = channels.get(ticket.channelId);
      return Boolean(channel && channel.ticketId === ticket.id && channel.cycle === ticket.reopenCount);
    },
    async ensureStructure(config, save) {
      calls.push(config.mode);
      for (const [key, value] of [['panelChannelId', ids.panel], ['logChannelId', ids.log], ['activeCategoryId', ids.category]]) {
        if (!config[key]) { config[key] = value; save(config); }
      }
      return config;
    },
    async publishPanel() { calls.push('panel'); return 'panel-message'; },
    async createTicketChannel(ticket) {
      calls.push('createChannel');
      const found = [...channels.values()].find(channel => channel.ticketId === ticket.id && channel.cycle === ticket.reopenCount);
      if (found) return found.id;
      const id = String(++channelSequence);
      channels.set(id, { id, ticketId: ticket.id, cycle: ticket.reopenCount, locked: false, messages: [{ id: '100000000000000001', authorId: ids.user, authorName: 'Criador', createdAt: new Date(time).toISOString(), content: '<script>alert(1)</script> & suporte', attachments: [] }] });
      return id;
    },
    async publishInitial(ticket, attachment) { calls.push(attachment ? 'initialWithTranscript' : 'initial'); if (attachment) assertBuffer(attachment); return `initial-${ticket.reopenCount}`; },
    async publishOpened() { calls.push('openedLog'); return 'opened-log'; },
    async updateTicketAccess() { calls.push('updateTicketAccess'); },
    async updateInitial() { calls.push('updateInitial'); },
    async scheduleChannelRemoval() { calls.push('scheduleChannelRemoval'); },
    async fetchMessages(guildId, channelId, { before, limit }) {
      calls.push('messages');
      const data = channels.get(channelId).messages.filter(m => !before || BigInt(m.id) < BigInt(before));
      return data.sort((a,b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, limit);
    },
    async latestMessageId(ticket) { return channels.get(ticket.channelId).messages.at(-1)?.id || null; },
    async publishClosed(ticket, attachment) { calls.push('closedLog'); assertBuffer(attachment); const id = `closed-${ticket.id}-${ticket.reopenCount}`; logs.set(id, attachment); return id; },
    async lockChannel(ticket) { calls.push('lock'); channels.get(ticket.channelId).locked = true; },
    async verifyClosedLog(ticket) { calls.push('verifyLog'); if (!logs.has(ticket.closing.logMessageId)) throw new Error('Log ausente'); },
    async removeChannel(ticket) { calls.push('delete'); channels.delete(ticket.channelId); },
  };
  const permissions = new TicketPermissionService(adapter);
  const transcripts = new TicketTranscriptService({ adapter, repository: transcriptRepository });
  const reconciliation = new TicketReconciliationService({ adapter, repository });
  const makeService = () => new TicketService({ repository, configs, adapter, permissions, transcripts, reconciliation, now });
  const service = makeService();
  const setup = new TicketSetupService({ repository: configs, adapter, permissions, now });
  const input = { guildId: ids.guild, userId: ids.user, channelId: ids.panel, categoryId: 'support', subject: 'Ajuda', description: 'Descrição do atendimento' };
  const create = overrides => service.create({ ...input, ...overrides });
  const action = ticket => ({ guildId: ids.guild, userId: ids.staff, channelId: ticket.channelId, ticketId: ticket.id });
  const close = ticket => service.close({ ...action(ticket), reason: 'Resolvido', summary: 'Orientação enviada' });
  const logAction = ticket => ({ ...action(ticket), channelId: ids.log, cycle: ticket.reopenCount });
  return { dir, repository, configs, transcriptRepository, adapter, channels, logs, actors, permissions, transcripts, reconciliation, service, setup, input, create, action, close, logAction, calls, makeService,
    advance(ms = 60_001) { time += ms; }, now };
}
function assertBuffer(value) { if (!Buffer.isBuffer(value) || !value.length) throw new Error('Transcript inválido'); }
module.exports = { ticketFixture, ids };
