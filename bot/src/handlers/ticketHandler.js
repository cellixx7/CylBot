const { MessageFlags, ButtonStyle } = require('discord.js');
const { clientError, isClientError } = require('../api/http/errors');
const { logger } = require('../lib/logger');
const { setupView, categoryView, modal, row, button } = require('../lib/ticketComponents');
const { ticketNumber } = require('../services/ticketConstants');
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const privateReply = content => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const context = interaction => ({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId });

async function report(interaction, error) {
  const controlled = isClientError(error);
  logger[controlled ? 'warn' : 'error']('ticket.interaction_failed', {
    guildId: interaction.guildId, userId: interaction.user?.id, channelId: interaction.channelId,
    // Não serializa erro de SDK que possa carregar assunto, mensagens ou payload.
    statusCode: controlled ? error.statusCode : 500,
  });
  const payload = privateReply(controlled ? error.message : 'Não foi possível concluir a operação. Os dados salvos foram preservados; tente novamente.');
  if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
  else await interaction.reply(payload);
}
async function startTicketSetup(interaction, services = interaction.client.services) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const session = await services.ticketSetup.begin(context(interaction));
    await interaction.editReply(setupView(session));
  } catch (error) { await report(interaction, error); }
}
async function handleTicketInteraction(interaction, services) {
  if (!interaction.customId?.startsWith('ticket:')) return false;
  try {
    if (!interaction.guildId || interaction.user.bot) throw clientError(403, 'Use esta ação em um servidor, com uma conta de usuário.');
    const input = context(interaction);
    const customId = interaction.customId;
    let match;
    if ((match = customId.match(new RegExp(`^ticket:setup:(start|cancel|role|auto|existing|panel|log|category|defaults|custom|confirm):(${UUID})$`)))) {
      const [, action, sessionId] = match;
      const selection = ['role', 'panel', 'log', 'category'].includes(action);
      const validKind = selection ? ({ role: interaction.isRoleSelectMenu?.(), panel: interaction.isChannelSelectMenu?.(), log: interaction.isChannelSelectMenu?.(), category: interaction.isChannelSelectMenu?.() }[action])
        : action === 'custom' ? interaction.isButton() || interaction.isModalSubmit() : interaction.isButton();
      if (!validKind) throw clientError(400, 'Controle de configuração inválido.');
      if (action === 'custom' && interaction.isButton()) {
        const session = await services.ticketSetup.session({ ...input, sessionId });
        if (session.step !== 'categories') throw clientError(400, 'Use os controles da etapa atual.');
        await interaction.showModal(modal(`setup:custom:${sessionId}`, 'Categorias de ticket', [['categories', 'Uma por linha: Nome | Descrição', 1000, true]]));
      } else {
        if (interaction.isModalSubmit()) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        else await interaction.deferUpdate();
        if (action === 'confirm') {
          const config = await services.ticketSetup.confirm({ ...input, sessionId });
          await interaction.editReply({ content: `Sistema configurado. Painel: <#${config.panelChannelId}>. Logs privados: <#${config.logChannelId}>.`, embeds: [], components: [], allowedMentions: { parse: [] } });
        } else {
          const session = await services.ticketSetup.change({ ...input, sessionId, action, values: interaction.values,
            ...(interaction.isModalSubmit() ? { categories: interaction.fields.getTextInputValue('ticket:categories') } : {}) });
          await interaction.editReply(session ? setupView(session) : { content: 'Configuração cancelada.', components: [] });
        }
      }
    } else if (customId === 'ticket:create' && interaction.isButton()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply(categoryView(await services.tickets.categories(input)));
    } else if (customId === 'ticket:category' && interaction.isStringSelectMenu?.()) {
      const categoryId = interaction.values?.[0];
      const categories = await services.tickets.categories(input);
      if (!categories.some(category => category.id === categoryId)) throw clientError(400, 'Categoria de ticket inválida.');
      await interaction.showModal(modal(`open:${categoryId}`, 'Abrir ticket', [['subject', 'Assunto', 100], ['description', 'Descrição', 2000, true]]));
    } else if ((match = customId.match(/^ticket:open:([a-z0-9-]{1,40})$/)) && interaction.isModalSubmit()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ticket = await services.tickets.create({ ...input, categoryId: match[1],
        subject: interaction.fields.getTextInputValue('ticket:subject'), description: interaction.fields.getTextInputValue('ticket:description') });
      await interaction.editReply({ content: `Ticket #${ticketNumber(ticket)} aberto: <#${ticket.channelId}>.`, allowedMentions: { parse: [] } });
    } else if ((match = customId.match(new RegExp(`^ticket:(claim|close|finish):(${UUID})$`)))) {
      const [, action, ticketId] = match;
      if (action === 'close' && interaction.isButton()) {
        await services.tickets.canClose({ ...input, ticketId });
        await interaction.showModal(modal(`finish:${ticketId}`, 'Encerrar ticket', [['reason', 'Motivo do fechamento', 1000, true], ['summary', 'Resumo da solução (opcional)', 1000, true, false]]));
      } else if (action === 'claim' && interaction.isButton()) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const ticket = await services.tickets.claim({ ...input, ticketId });
        await interaction.editReply({ content: `Você assumiu o ticket #${ticketNumber(ticket)}.`, allowedMentions: { parse: [] } });
      } else if (action === 'finish' && interaction.isModalSubmit()) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const ticket = await services.tickets.close({ ...input, ticketId,
          reason: interaction.fields.getTextInputValue('ticket:reason'), summary: interaction.fields.getTextInputValue('ticket:summary') });
        await interaction.editReply({ content: `Ticket #${ticketNumber(ticket)} encerrado e transcrito. A equipe pode remover o canal ou reabrir pelo log privado.`, allowedMentions: { parse: [] } });
      } else throw clientError(400, 'Controle de ticket inválido.');
    } else if ((match = customId.match(new RegExp(`^ticket:(reopen|remove|delete):(${UUID}):(\\d{1,6})$`))) && interaction.isButton()) {
      const [, action, ticketId, cycle] = match;
      if (action === 'remove') {
        await interaction.reply({ ...privateReply('Remover o canal encerrado? O ticket e a transcrição serão mantidos.'),
          components: [row(button(`delete:${ticketId}:${cycle}`, 'Confirmar remoção', ButtonStyle.Danger))] });
      } else {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const ticket = await services.tickets[action === 'reopen' ? 'reopen' : 'removeChannel']({ ...input, ticketId, cycle: Number(cycle) });
        await interaction.editReply({ content: action === 'reopen' ? `Ticket #${ticketNumber(ticket)} reaberto: <#${ticket.channelId}>.` : 'Canal removido. O ticket e seu histórico foram preservados.', components: [], allowedMentions: { parse: [] } });
      }
    } else throw clientError(400, 'Controle de ticket inválido ou desatualizado.');
  } catch (error) { await report(interaction, error); }
  return true;
}
module.exports = { startTicketSetup, handleTicketInteraction };
