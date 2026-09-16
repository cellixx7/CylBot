const { logger } = require('../lib/logger');
const { getConfig } = require('../config/env');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const OpenRouterService = require('../services/openRouterService');
const TextaAISessionManager = require('../services/textaAISessionManager');
const { TextaAIService } = require('../services/textaAIService');

const textaAIService = new TextaAIService({
  ai: new OpenRouterService(getConfig().openRouter),
  sessions: new TextaAISessionManager(),
});

async function handleTextaAIInteraction(interaction, service = textaAIService) {
  if (interaction.isModalSubmit() && interaction.customId.startsWith('texta_ai:idea:')) {
    await handleIdea(interaction, service);
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('texta_ai:send:')) {
    await handleApprove(interaction, service);
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('texta_ai:more:')) {
    await handleCorrectionRequest(interaction, service);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('texta_ai:correction:')) {
    await handleCorrection(interaction, service);
    return true;
  }

  return false;
}

async function handleIdea(interaction, service) {
  const outputType = interaction.customId.split(':')[2];
  const idea = interaction.fields.getTextInputValue('texta_ai:idea');
  const characters = Number.parseInt(
    interaction.fields.getTextInputValue('texta_ai:characters'),
    10,
  );

  if (!Number.isInteger(characters) || characters < 1 || characters > 2000) {
    await interaction.reply({
      content: 'Informe um tamanho entre 1 e 2.000 caracteres.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sessionId = service.create({
    userId: interaction.user.id,
    channelId: interaction.channelId,
    outputType,
    idea,
    targetCharacters: characters,
  });

  await generateAndReply(interaction, sessionId, service);
}

async function handleCorrectionRequest(interaction, service) {
  const sessionId = interaction.customId.split(':')[2];
  const session = service.beginRevision(sessionId, interaction.user.id);

  if (!session) {
    await interaction.reply({ content: getStalePreviewMessage(sessionId, interaction.user.id, service), flags: MessageFlags.Ephemeral });
    return;
  }

  await safelyDisablePreview(interaction.message);

  const modal = new ModalBuilder()
    .setCustomId(`texta_ai:correction:${sessionId}`)
    .setTitle('Texta_AI — Ajustar texto')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('texta_ai:additional-context')
          .setLabel('O que deve ser alterado?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Ex.: inclua horário, duração e motivo da manutenção.')
          .setRequired(true)
          .setMaxLength(2000),
      ),
    );

  await interaction.showModal(modal);
}

async function handleCorrection(interaction, service) {
  const sessionId = interaction.customId.split(':')[2];
  const session = service.claimRevision(sessionId, interaction.user.id,
    interaction.fields.getTextInputValue('texta_ai:additional-context'));

  if (!session) {
    await interaction.reply({ content: getStalePreviewMessage(sessionId, interaction.user.id, service), flags: MessageFlags.Ephemeral });
    return;
  }

  await generateAndReply(interaction, sessionId, service, session);
}

async function handleApprove(interaction, service) {
  const sessionId = interaction.customId.split(':')[2];
  let session;
  try {
    session = service.claimForSend(sessionId, interaction.user.id, interaction.channelId);
  } catch (error) {
    if (error.code !== 'TEXTA_WRONG_CHANNEL') throw error;
    await interaction.reply({ content: 'A mensagem precisa ser aprovada no canal original.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (!session) {
    await interaction.reply({ content: getStalePreviewMessage(sessionId, interaction.user.id, service), flags: MessageFlags.Ephemeral });
    return;
  }

  await disablePreview(interaction);
  const payload = session.outputType === 'embed'
    ? { embeds: [toDiscordEmbed(session.generated)], allowedMentions: { parse: [] } }
    : { content: session.generated.content, allowedMentions: { parse: [] } };

  try {
    await interaction.channel.send(payload);
    service.markSent(sessionId, interaction.user.id);
    await safelyEditPreview(interaction, {
      content: '✅ Mensagem enviada com sucesso.',
      embeds: [],
      components: [],
    });
  } catch (error) {
    service.release(sessionId, interaction.user.id);
    if (!isUnknownMessage(error)) {
      logger.error('texta_ai.send_failed', { module: 'textaAIHandler', operation: 'texta_ai.send',
        guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, error });
    }
    await safelyFollowUp(interaction, {
      content: isUnknownMessage(error)
        ? 'A prévia expirou ou foi removida antes do envio.'
        : 'Não foi possível publicar a mensagem neste canal.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function generateAndReply(interaction, sessionId, service, claimedSession = null) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const session = await service.generateSession(sessionId, interaction.user.id, claimedSession);
    if (!session) {
      await interaction.editReply({
        content: 'Essa sessão já está sendo processada, foi enviada ou expirou.',
        components: [],
      });
      return;
    }
    session.previewMessage = await interaction.editReply(buildPreview(sessionId, session));
  } catch (error) {
    logger.error('texta_ai.generate_failed', { module: 'textaAIHandler', operation: 'texta_ai.generate', provider: 'openrouter',
      guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, error });
    service.discard(sessionId);
    await interaction.editReply({
      content: getFriendlyGenerationError(error),
      components: [],
    });
  }
}

function buildPreview(sessionId, session) {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`texta_ai:send:${sessionId}`)
      .setLabel('Enviar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`texta_ai:more:${sessionId}`)
      .setLabel('Adicionar mais')
      .setStyle(ButtonStyle.Secondary),
  );

  if (session.outputType === 'embed') {
    return {
      content: 'Prévia privada do embed:',
      embeds: [toDiscordEmbed(session.generated)],
      components: [buttons],
    };
  }

  return {
    content: `Prévia privada:\n\n${session.generated.content}`,
    components: [buttons],
  };
}

async function disablePreview(interaction) {
  try {
    await interaction.update({ components: disableComponents(interaction.message.components) });
  } catch (error) {
    if (!isUnknownMessage(error)) throw error;
  }
}

function disableComponents(components) {
  return components.map((row) => ({
    type: row.type,
    components: row.components.map((component) => ({
      type: component.type,
      custom_id: component.customId,
      style: component.style,
      label: component.label,
      disabled: true,
    })),
  }));
}

async function safelyEditPreview(interaction, payload) {
  try {
    await interaction.message.edit(payload);
  } catch (error) {
    if (!isUnknownMessage(error)) throw error;
  }
}

async function safelyDisablePreview(message) {
  try {
    await message.edit({ components: disableComponents(message.components) });
  } catch (error) {
    if (!isUnknownMessage(error)) throw error;
  }
}

async function safelyFollowUp(interaction, payload) {
  try {
    await interaction.followUp(payload);
  } catch (error) {
    if (!isUnknownMessage(error)) throw error;
  }
}

function isUnknownMessage(error) {
  return error?.code === 10008 || error?.status === 404;
}

function getFriendlyGenerationError(error) {
  if (error?.message?.includes('OpenRouter')) return error.message;
  if (error?.name === 'AbortError' || error?.message?.includes('demorou')) {
    return 'A geração demorou demais. Tente novamente.';
  }
  return 'Não foi possível gerar a mensagem agora. Tente novamente.';
}

function getStalePreviewMessage(sessionId, userId, service) {
  const status = service.getStatus(sessionId, userId);

  if (status === 'awaiting_correction' || status === 'processing') {
    return 'Esta prévia já foi substituída por uma versão mais recente.';
  }

  if (status === 'sent') {
    return 'Esta mensagem já foi enviada.';
  }

  return 'Esta prévia expirou ou não pertence a você.';
}

function toDiscordEmbed(generated) {
  const embed = new EmbedBuilder()
    .setDescription(generated.description)
    .setColor(0x5865f2);

  if (generated.title) embed.setTitle(generated.title);
  if (generated.fields.length) embed.addFields(generated.fields);
  return embed;
}

module.exports = { handleTextaAIInteraction };