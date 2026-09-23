const { ChannelType, PermissionFlagsBits: P, OverwriteType, AttachmentBuilder } = require('discord.js');
const { createHash } = require('node:crypto');
const { clientError } = require('../../api/http/errors');
const { ticketNumber } = require('../services/ticketConstants');
const { logger } = require('../../lib/logger');
const { ticketLogContext } = require('../lib/ticketDiagnostics');
const { panelPayload, initialPayload, openedPayload, closedPayload } = require('../lib/ticketComponents');
const READ = [P.ViewChannel, P.ReadMessageHistory];
const WRITE = [P.SendMessages, P.AttachFiles, P.EmbedLinks];
const NO_WRITE = [...WRITE, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads, P.AddReactions];
// Discord só permite alterar bits que o bot possui; os de threads/reações são negados ao fechar.
const BOT_PERMISSIONS = [...READ, ...NO_WRITE, P.ManageChannels, P.ManageRoles];
// ManageRoles é herdado da guild: defini-lo em um overwrite exige Administrator no Discord.
const BOT_CHANNEL_ALLOW = BOT_PERMISSIONS.filter(permission => permission !== P.ManageRoles);
const nonce = key => createHash('sha256').update(key).digest('hex').slice(0, 24);

class DiscordTicketAdapter {
  constructor(client, config) { this.client = client; this.config = config; }
  async guild(guildId) {
    const guild = await this.client.guilds.fetch(guildId);
    if (!guild) throw clientError(404, 'Servidor indisponível.');
    return guild;
  }
  async guildName(guildId) { return (await this.guild(guildId)).name; }
  async getActor(guildId, userId) {
    const guild = await this.guild(guildId);
    let member;
    try { member = await guild.members.fetch({ user: userId, force: true }); }
    catch (error) { if (error.code === 10007) throw clientError(403, 'O usuário não participa mais deste servidor.'); throw error; }
    return { id: member.id, name: member.displayName, bot: member.user.bot, permissions: member.permissions.bitfield.toString(), roleIds: [...member.roles.cache.keys()] };
  }
  async channel(guildId, channelId, type = ChannelType.GuildText) {
    const channel = await (await this.guild(guildId)).channels.fetch(channelId, { force: true });
    if (!channel || channel.guildId !== guildId || channel.type !== type) throw clientError(400, 'Canal inválido ou de outro servidor.');
    return channel;
  }
  async bot(guild) { return guild.members.fetchMe({ force: true }); }
  checkPermissions(channel, bot, permissions = BOT_PERMISSIONS) {
    if (!channel.permissionsFor(bot)?.has(permissions)) throw clientError(403, 'Confira as permissões do bot: canais/cargos, leitura/histórico, envio/anexos/embeds, reações e criação/envio em threads.');
  }
  async validateSetup(config) {
    if (!this.config.messageContentEnabled) throw clientError(503, 'Ative Message Content no Developer Portal e TICKETS_MESSAGE_CONTENT_ENABLED=true na configuração do bot, depois reinicie.');
    const guild = await this.guild(config.guildId);
    const bot = await this.bot(guild);
    if (!bot.permissions.has(BOT_PERMISSIONS)) throw clientError(403, 'O bot não possui as permissões necessárias para criar e gerenciar tickets.');
    for (const roleId of config.supportRoleIds) {
      const role = await guild.roles.fetch(roleId, { force: true });
      if (!role || role.id === guild.id || role.managed) throw clientError(400, 'Selecione um cargo de suporte válido, não gerenciado e diferente de @everyone.');
    }
    if (config.mode === 'existing') await this.validateStructure(config);
  }
  async validatePrivateLog(guildId, channelId, supportRoleIds) {
    const channel = await this.channel(guildId, channelId);
    const bot = await this.bot(channel.guild);
    this.checkPermissions(channel, bot);
    const everyone = channel.permissionOverwrites.cache.get(guildId);
    const permitted = new Set([...supportRoleIds, bot.id]);
    if (!everyone?.deny.has(P.ViewChannel) || channel.permissionOverwrites.cache.some(overwrite => overwrite.allow.has(P.ViewChannel) && !permitted.has(overwrite.id))) {
      throw clientError(403, 'O canal de logs deve negar Ver Canal a @everyone e permitir acesso somente ao bot e aos cargos de suporte selecionados.');
    }
    for (const roleId of supportRoleIds) if (!channel.permissionsFor(roleId)?.has(READ)) throw clientError(403, 'O cargo de suporte precisa ler o canal de logs.');
    return channel;
  }
  async validateStructure(config) {
    if (!this.config.messageContentEnabled) throw clientError(503, 'A captura de conteúdo de mensagens está desabilitada na configuração do bot.');
    if (config.panelChannelId === config.logChannelId) throw clientError(400, 'Painel público e logs privados precisam ser canais diferentes.');
    const guild = await this.guild(config.guildId);
    const bot = await this.bot(guild);
    for (const roleId of config.supportRoleIds) if (!(await guild.roles.fetch(roleId, { force: true }))) throw clientError(400, 'Cargo de suporte não encontrado.');
    const panel = await this.channel(guild.id, config.panelChannelId);
    this.checkPermissions(panel, bot);
    if (!panel.permissionsFor(guild.roles.everyone)?.has(READ)) throw clientError(403, 'O painel precisa estar em um canal público com histórico visível.');
    this.checkPermissions(await this.channel(guild.id, config.activeCategoryId, ChannelType.GuildCategory), bot);
    await this.validatePrivateLog(guild.id, config.logChannelId, config.supportRoleIds);
  }
  overwrites(guildId, botId, supportRoleIds, creatorUserId, locked = false) {
    const ids = [...new Set([...supportRoleIds, ...(creatorUserId ? [creatorUserId] : [])])];
    return [
      { id: guildId, type: OverwriteType.Role, deny: [P.ViewChannel, ...NO_WRITE] },
      { id: botId, type: OverwriteType.Member, allow: BOT_CHANNEL_ALLOW },
      ...ids.filter(id => id !== botId).map(id => ({ id, type: id === creatorUserId ? OverwriteType.Member : OverwriteType.Role,
        allow: locked ? READ : [...READ, ...WRITE], deny: locked ? NO_WRITE : [P.CreatePublicThreads, P.CreatePrivateThreads] })),
    ];
  }
  async ensureStructure(config, save) {
    if (config.mode === 'existing') return config;
    const guild = await this.guild(config.guildId);
    const bot = await this.bot(guild);
    const privateOverwrites = this.overwrites(guild.id, bot.id, config.supportRoleIds);
    // IDs persistidos após cada recurso. Recursos existentes nunca são apagados pelo setup.
    for (const [key, options] of [
      ['publicCategoryId', { name: 'TICKETS', type: ChannelType.GuildCategory, permissionOverwrites: [
        { id: guild.id, type: OverwriteType.Role, allow: READ, deny: NO_WRITE }, { id: bot.id, type: OverwriteType.Member, allow: BOT_CHANNEL_ALLOW },
      ] }],
      ['activeCategoryId', { name: 'em-atendimento', type: ChannelType.GuildCategory, permissionOverwrites: privateOverwrites }],
      ['panelChannelId', { name: 'abrir-ticket', type: ChannelType.GuildText }],
      ['logChannelId', { name: 'ticket-log', type: ChannelType.GuildText, permissionOverwrites: privateOverwrites }],
    ]) {
      if (config[key]) continue;
      if (key === 'panelChannelId') options.parent = config.publicCategoryId;
      if (key === 'logChannelId') options.parent = config.activeCategoryId;
      const channel = await guild.channels.create({ ...options, reason: 'Configuração de tickets solicitada por administrador' });
      config[key] = channel.id; save(config);
    }
    return config;
  }
  async send(channel, payload, key) { return channel.send({ ...payload, nonce: nonce(key), enforceNonce: true, allowedMentions: { parse: [] } }); }
  async publishPanel(config) { return (await this.send(await this.channel(config.guildId, config.panelChannelId), panelPayload(), `panel:${config.setupId}`)).id; }
  async createTicketChannel(ticket, config) {
    const guild = await this.guild(ticket.guildId);
    const bot = await this.bot(guild);
    const topic = `cylbot-ticket:${ticket.id}:${ticket.reopenCount}`;
    const channels = await guild.channels.fetch();
    const existing = channels.find(channel => channel?.type === ChannelType.GuildText && channel.topic === topic);
    const overwrites = this.overwrites(guild.id, bot.id, ticket.supportRoleIds, ticket.creatorUserId);
    this.checkPermissions(await this.channel(guild.id, config.activeCategoryId, ChannelType.GuildCategory), bot);
    const channel = existing || await guild.channels.create({ name: `ticket-${ticketNumber(ticket)}`, type: ChannelType.GuildText,
      parent: config.activeCategoryId, topic, permissionOverwrites: overwrites, reason: `Ticket #${ticketNumber(ticket)}` });
    if (existing) await channel.permissionOverwrites.set(overwrites);
    this.checkPermissions(channel, bot);
    return channel.id;
  }
  attachment(ticket, data) { return new AttachmentBuilder(data, { name: `ticket-${ticketNumber(ticket)}-ciclo-${ticket.closing ? ticket.reopenCount : ticket.reopenCount - 1}.html` }); }
  async publishInitial(ticket, previousTranscript) {
    const payload = initialPayload(ticket);
    if (previousTranscript) payload.files = [this.attachment(ticket, previousTranscript)];
    return (await this.send(await this.channel(ticket.guildId, ticket.channelId), payload, `initial:${ticket.id}:${ticket.reopenCount}`)).id;
  }
  async updateInitial(ticket) {
    const channel = await this.channel(ticket.guildId, ticket.channelId);
    await (await channel.messages.fetch(ticket.initialMessageId)).edit(initialPayload(ticket));
  }
  async publishOpened(ticket) {
    const channel = await this.validatePrivateLog(ticket.guildId, ticket.logChannelId, ticket.supportRoleIds);
    return (await this.send(channel, openedPayload(ticket), `opened:${ticket.id}`)).id;
  }
  async publishClosed(ticket, transcript) {
    const channel = await this.validatePrivateLog(ticket.guildId, ticket.logChannelId, ticket.supportRoleIds);
    const payload = { ...closedPayload(ticket), files: [this.attachment(ticket, transcript)] };
    if (ticket.closing.logMessageId) {
      const message = await channel.messages.fetch(ticket.closing.logMessageId);
      await message.edit({ ...payload, attachments: [] });
      return message.id;
    }
    return (await this.send(channel, payload, `closed:${ticket.id}:${ticket.reopenCount}`)).id;
  }
  async lockChannel(ticket) {
    const channel = await this.channel(ticket.guildId, ticket.channelId);
    await channel.permissionOverwrites.set(this.overwrites(ticket.guildId, (await this.bot(channel.guild)).id, ticket.supportRoleIds, ticket.creatorUserId, true));
  }
  async verifyClosedLog(ticket) {
    const channel = await this.validatePrivateLog(ticket.guildId, ticket.logChannelId, ticket.supportRoleIds);
    const message = await channel.messages.fetch(ticket.closing.logMessageId);
    if (message.author.id !== this.client.user.id || !message.attachments.some(attachment => attachment.name === `ticket-${ticketNumber(ticket)}-ciclo-${ticket.reopenCount}.html`)) throw clientError(409, 'Log final ou transcrição ausente. O canal foi preservado.');
  }
  async removeChannel(ticket) {
    if (!ticket.channelId) throw clientError(409, 'O ticket não possui um canal para remover.');
    let channel;
    try { channel = await (await this.guild(ticket.guildId)).channels.fetch(ticket.channelId, { force: true }); }
    catch (error) { if (error.code === 10003) return false; throw error; }
    if (!channel) return false;
    if (channel.id !== ticket.channelId || channel.guildId !== ticket.guildId || channel.type !== ChannelType.GuildText
      || channel.topic !== `cylbot-ticket:${ticket.id}:${ticket.reopenCount}` || channel.id === ticket.logChannelId) {
      logger.warn('ticket.channel.inconsistent', { ...ticketLogContext(), guildId: ticket.guildId, ticketId: ticket.id,
        channelId: ticket.channelId });
      throw Object.assign(clientError(409, 'O canal não corresponde a este ticket e ciclo. Nenhum canal foi removido.'), { code: 'TICKET_CHANNEL_MISMATCH' });
    }
    await this.lockChannel(ticket);
    if (await this.latestMessageId(ticket) !== ticket.closing.transcript.lastMessageId) throw clientError(409, 'Há mensagens posteriores à transcrição. O canal foi preservado para revisão manual.');
    await channel.delete(`Ticket #${ticketNumber(ticket)} encerrado e transcrito`);
    return true;
  }
  async latestMessageId(ticket) {
    const messages = await (await this.channel(ticket.guildId, ticket.channelId)).messages.fetch({ limit: 1, cache: false });
    return messages.first()?.id || null;
  }
  async fetchMessages(guildId, channelId, options) {
    if (!this.config.messageContentEnabled) throw clientError(503, 'Captura de mensagens desabilitada; o canal foi preservado.');
    const channel = await this.channel(guildId, channelId);
    this.checkPermissions(channel, await this.bot(channel.guild));
    const messages = await channel.messages.fetch({ ...options, cache: false });
    return [...messages.values()].map(message => ({ id: message.id, authorId: message.author.id, authorName: message.author.username,
      authorBot: message.author.bot === true,
      createdAt: message.createdAt.toISOString(), content: message.content,
      embeds: message.embeds.map(embed => [embed.title, embed.description, ...(embed.fields || []).map(field => `${field.name}: ${field.value}`)].filter(Boolean).join('\n')),
      attachments: [...message.attachments.values()].map(attachment => ({ name: attachment.name, size: attachment.size, url: attachment.url })),
    }));
  }

  async aiChannel(ticket) {
    const channel = await this.channel(ticket.guildId, ticket.channelId);
    if (channel.topic !== `cylbot-ticket:${ticket.id}:${ticket.reopenCount}`) throw clientError(409, 'Canal não corresponde ao ticket.');
    return channel;
  }
  async publishTicketMessage(ticket, message) {
    const internal = message.visibility === 'INTERNAL';
    const channel = internal
      ? await this.validatePrivateLog(ticket.guildId, ticket.logChannelId, ticket.supportRoleIds)
      : await this.aiChannel(ticket);
    const name = String(message.authorName || 'CylBot').replace(/[\r\n]/g, ' ').slice(0, 80);
    let heading = `**${name} · via Web**`;
    if (message.authorType === 'AI') heading = internal
      ? `**Sugestão de IA · Ticket #${ticketNumber(ticket)}**`
      : '**CylBot · Assistente IA**';
    if (message.authorType === 'SYSTEM') heading = '**CylBot · Sistema de atendimento**';
    const suffix = internal ? '\n\nRevisão humana necessária; nenhuma alteração administrativa foi executada.' : '';
    const sent = await this.send(channel, { content: `${heading}\n${message.content}${suffix}` }, `ticket-message:${message.id}`);
    return { id: sent.id, channelId: channel.id };
  }
  async aiHandoffStaff(ticket, runId) {
    const log = await this.validatePrivateLog(ticket.guildId, ticket.logChannelId, ticket.supportRoleIds);
    await this.send(log, { content: `Atendimento humano solicitado no ticket #${ticketNumber(ticket)}: <#${ticket.channelId}>. IA pausada.` }, `ticket-ai-human-log:${runId}`);
  }
}
module.exports = { DiscordTicketAdapter, BOT_PERMISSIONS };
