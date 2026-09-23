const { MessageFlags, ButtonBuilder, ButtonStyle } = require('discord.js');
const { modal, row } = require('../lib/ticketComponents');
const { clientError, isClientError } = require('../../api/http/errors');
const { logger } = require('../../lib/logger');
const { errorDetails } = require('../lib/ticketDiagnostics');
const { DEFAULT_CONFIG } = require('../services/ticketAIContract');
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const privateReply = content => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

async function fail(interaction, error) {
  logger.warn('ticket.ai.failed', { guildId: interaction.guildId, ...errorDetails(error) });
  const payload = privateReply(isClientError(error) ? error.message : 'Não foi possível concluir a operação de IA. O ticket foi preservado.');
  try { if (interaction.deferred || interaction.replied) await interaction.followUp(payload); else await interaction.reply(payload); }
  catch { logger.warn('ticket.ai.response_failed', { guildId: interaction.guildId }); }
}
async function startTicketAIConfig(interaction) {
  try {
    if (!interaction.guildId || interaction.user.bot) throw clientError(403, 'Use esta ação em um servidor.');
    // Modais precisam ser reconhecidos em até três segundos. A autorização e a configuração atual
    // são carregadas no submit, após deferReply; abrir o formulário não grava nem chama provider.
    const config = DEFAULT_CONFIG;
    const form = modal('ai:config', 'IA de tickets', [
      ['ai-level', 'Nível: 0 off, 1 sugestão, 2 auto, 3 limitado', 1],
      ['ai-tone', 'Tom', 80], ['ai-context', 'Contexto do servidor', 2000, true, false],
      ['ai-instructions', 'Instruções de suporte', 2000, true, false],
      ['ai-capabilities', 'Capacidades separadas por vírgula', 150],
    ]);
    [String(config.enabled ? config.autonomyLevel : 0), config.tone, config.serverContext, config.supportInstructions, config.capabilities.join(',')]
      .forEach((value, index) => { if (value) form.components[index].components[0].setValue(value); });
    await interaction.showModal(form);
  } catch (error) { await fail(interaction, error); }
}
async function handleTicketAIInteraction(interaction, services) {
  if (!interaction.customId?.startsWith('ticket:ai:')) return false;
  try {
    if (!interaction.guildId || interaction.user.bot) throw clientError(403, 'Use esta ação em um servidor.');
    const base = { guildId: interaction.guildId, userId: interaction.user.id };
    if (interaction.customId === 'ticket:ai:config' && interaction.isModalSubmit()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const current = await services.ticketAI.getConfig(base);
      const value = key => interaction.fields.getTextInputValue(`ticket:ai-${key}`);
      const level = value('level');
      if (!/^[0-3]$/.test(level)) throw clientError(400, 'Autonomia deve ser de 0 a 3.');
      await services.ticketAI.configure({ ...base, config: { ...current, enabled: level !== '0', autonomyLevel: Number(level),
        tone: value('tone'), serverContext: value('context'), supportInstructions: value('instructions'),
        capabilities: value('capabilities').split(',').map(item => item.trim()).filter(Boolean) } });
      await interaction.editReply({ content: 'Configuração de IA salva. A geração exige habilitação da guild no ambiente e PostgreSQL.', allowedMentions: { parse: [] } });
    } else {
      const match = interaction.customId.match(new RegExp(`^ticket:ai:(menu|suggest|pause|resume):(${UUID})$`));
      if (!match || !interaction.isButton()) throw clientError(400, 'Controle de IA inválido.');
      const [, action, ticketId] = match;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ticket = await services.tickets.ticket(base.guildId, ticketId);
      services.tickets.channel(ticket, interaction.channelId);
      await services.tickets.permissions.requireStaff(base.guildId, base.userId, ticket);
      if (action === 'menu') {
        const control = (verb, label) => new ButtonBuilder().setCustomId(`ticket:ai:${verb}:${ticketId}`).setLabel(label).setStyle(ButtonStyle.Secondary);
        await interaction.editReply({ content: 'Assistente IA — controles da equipe', components: [row(control('suggest', 'Sugerir resposta'), control('pause', 'Pausar IA'), control('resume', 'Retomar IA'))] });
      } else if (action === 'suggest') {
        const result = await services.ticketAI.analyze({ ...base, ticketId });
        await interaction.editReply({ content: result.status === 'failed' ? 'IA temporariamente indisponível. O ticket foi preservado.'
          : result.proposal.message ? `**Sugestão IA · ${result.proposal.action}**\n${result.proposal.message}\n\nRevise antes de utilizar.`
          : 'Nenhuma sugestão disponível: confira configuração, pausa e limites.', allowedMentions: { parse: [] } });
      } else {
        await services.ticketAI.pause({ ...base, ticketId, paused: action === 'pause' });
        await interaction.editReply({ content: action === 'pause' ? 'IA pausada neste ticket.' : 'Pausa removida. Tickets assumidos continuam sob prioridade humana.' });
      }
    }
  } catch (error) { await fail(interaction, error); }
  return true;
}
module.exports = { handleTicketAIInteraction, startTicketAIConfig };
