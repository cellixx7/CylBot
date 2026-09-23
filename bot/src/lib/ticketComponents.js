const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { ticketNumber, TICKET_STATUS } = require('../services/ticketConstants');
const row = (...items) => new ActionRowBuilder().addComponents(...items);
const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`ticket:${id}`).setLabel(label).setStyle(style);
const modal = (id, title, fields) => new ModalBuilder().setCustomId(`ticket:${id}`).setTitle(title).addComponents(fields.map(([key, label, max, paragraph = false, required = true]) => row(
  new TextInputBuilder().setCustomId(`ticket:${key}`).setLabel(label).setMaxLength(max).setRequired(required)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short),
)));
function setupView(session) {
  const id = action => `setup:${action}:${session.id}`;
  const cancel = row(button(id('cancel'), 'Cancelar', ButtonStyle.Danger));
  let content; let components;
  switch (session.step) {
    case 'start': content = 'CONFIGURAÇÃO DE TICKETS\nVamos configurar o sistema deste servidor.'; components = [row(button(id('start'), 'Começar', ButtonStyle.Primary))]; break;
    case 'role': content = 'Qual cargo poderá atender tickets?'; components = [row(new RoleSelectMenuBuilder().setCustomId(`ticket:${id('role')}`).setMinValues(1).setMaxValues(1))]; break;
    case 'structure': content = 'Criar a estrutura automaticamente ou selecionar canais existentes?'; components = [row(button(id('auto'), 'Criar automaticamente'), button(id('existing'), 'Usar canais existentes'))]; break;
    case 'panel': case 'log': case 'category': {
      content = { panel: 'Selecione o canal público do painel.', log: 'Selecione o canal privado de logs. Somente suporte, bot e administradores devem acessá-lo.', category: 'Selecione a categoria onde os canais de atendimento serão criados.' }[session.step];
      components = [row(new ChannelSelectMenuBuilder().setCustomId(`ticket:${id(session.step)}`).setChannelTypes(session.step === 'category' ? ChannelType.GuildCategory : ChannelType.GuildText).setMinValues(1).setMaxValues(1))]; break;
    }
    case 'categories': content = 'Use Suporte, Denúncia, Financeiro e Outro, ou informe até cinco categorias.'; components = [row(button(id('defaults'), 'Usar padrão'), button(id('custom'), 'Personalizar categorias'))]; break;
    case 'confirm': content = `Confira a configuração:\nEstrutura: ${session.mode === 'auto' ? 'automática' : 'existente'}\nCargo: ${session.supportRoleIds.join(', ')}\nCategorias: ${session.categories.map(c => c.name).join(', ')}\nLogs e transcrições serão privados. Uma publicação interrompida pode ser retomada com /ticket.`;
      components = [row(button(id('confirm'), 'Confirmar e publicar', ButtonStyle.Success))]; break;
    default: throw new Error('Etapa de setup desconhecida.');
  }
  return { content, embeds: [], components: [...components, cancel], allowedMentions: { parse: [] } };
}
function panelPayload() {
  // Ponto único para futuro branding condicionado a entitlements; não há Premium no MVP.
  return { embeds: [new EmbedBuilder().setTitle('🎫 Suporte').setDescription('Precisa de ajuda?\nAbra um ticket e nossa equipe irá atendê-lo.\nO atendimento e sua transcrição ficam disponíveis à equipe de suporte.').setColor(0x176b57)],
    components: [row(button('create', 'Abrir ticket', ButtonStyle.Primary))], allowedMentions: { parse: [] } };
}
function categoryView(categories) {
  return { content: 'Selecione a categoria do atendimento.', components: [row(new StringSelectMenuBuilder().setCustomId('ticket:category').setPlaceholder('Categoria').addOptions(categories.map(c => ({ label: c.name, value: c.id, description: c.description || c.name }))))] };
}
function initialPayload(ticket) {
  const status = { [TICKET_STATUS.OPEN]: 'Aberto', [TICKET_STATUS.CLAIMED]: 'Em atendimento', [TICKET_STATUS.CLOSED]: 'Encerrado', [TICKET_STATUS.REOPENED]: 'Reaberto' }[ticket.status];
  const embed = new EmbedBuilder().setTitle(`🎫 Ticket #${ticketNumber(ticket)}${ticket.reopenCount ? ' reaberto' : ''}`).setColor(0x176b57)
    .setDescription(ticket.description).addFields(
      { name: 'Categoria', value: ticket.categoryName }, { name: 'Criado por', value: `${ticket.creatorName} (${ticket.creatorUserId})` },
      { name: 'Assunto', value: ticket.subject }, { name: 'Status', value: status },
      { name: 'Responsável', value: ticket.assignedUserId ? `${ticket.assignedName} (${ticket.assignedUserId})` : 'Nenhum' },
    );
  if (ticket.reopenCount) embed.addFields({ name: 'Histórico anterior', value: `Encerrado em ${new Date(ticket.closedAt).toISOString()}.\nReaberto por ${ticket.reopenedByName} (${ticket.reopenedBy}).\nTranscrição anterior anexada.` });
  return { embeds: [embed], components: ticket.status === TICKET_STATUS.CLOSED ? [] : [row(button(`claim:${ticket.id}`, 'Assumir', ButtonStyle.Primary), button(`close:${ticket.id}`, 'Fechar', ButtonStyle.Danger))], allowedMentions: { parse: [] } };
}
function openedPayload(ticket) {
  return { embeds: [new EmbedBuilder().setTitle(`Ticket #${ticketNumber(ticket)} aberto`).setColor(0x176b57)
    .addFields({ name: 'Usuário', value: `${ticket.creatorName} (${ticket.creatorUserId})` }, { name: 'Categoria', value: ticket.categoryName },
      { name: 'Assunto', value: ticket.subject }, { name: 'Criado em', value: new Date(ticket.createdAt).toISOString() }, { name: 'Canal', value: `<#${ticket.channelId}>` })], allowedMentions: { parse: [] } };
}
function closedPayload(ticket) {
  return { embeds: [new EmbedBuilder().setTitle(`Ticket #${ticketNumber(ticket)} encerrado`).setColor(0x596275).addFields(
    { name: 'Criado por', value: `${ticket.creatorName} (${ticket.creatorUserId})` }, { name: 'Atendido por', value: ticket.assignedUserId ? `${ticket.assignedName} (${ticket.assignedUserId})` : 'Não atribuído' },
    { name: 'Categoria', value: ticket.categoryName }, { name: 'Aberto', value: new Date(ticket.createdAt).toISOString() },
    { name: 'Assumido', value: ticket.claimedAt ? new Date(ticket.claimedAt).toISOString() : '—' },
    { name: 'Encerramento solicitado', value: new Date(ticket.closing.startedAt).toISOString() },
    { name: 'Motivo', value: ticket.closing.reason }, { name: 'Resumo', value: ticket.closing.summary || 'Não informado' },
  )], components: [row(button(`reopen:${ticket.id}:${ticket.reopenCount}`, 'Reabrir', ButtonStyle.Success), button(`remove:${ticket.id}:${ticket.reopenCount}`, 'Remover canal', ButtonStyle.Danger))], allowedMentions: { parse: [] } };
}
module.exports = { setupView, panelPayload, categoryView, initialPayload, openedPayload, closedPayload, modal, row, button };
