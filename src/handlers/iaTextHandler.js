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
const IaTextSessionManager = require('../services/iaTextSessionManager');

const openRouterService = new OpenRouterService();
const sessions = new IaTextSessionManager();

async function handleIaTextInteraction(interaction) {
  if (interaction.isModalSubmit() && interaction.customId.startsWith('iatext:idea:')) {
    await handleIdea(interaction);
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('iatext:send:')) {
    await handleApprove(interaction);
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('iatext:more:')) {
    await handleCorrectionRequest(interaction);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('iatext:correction:')) {
    await handleCorrection(interaction);
    return true;
  }

  return false;
}

async function handleIdea(interaction) {
  const outputType = interaction.customId.split(':')[2];
  const idea = interaction.fields.getTextInputValue('iatext:idea');
  const characters = Number.parseInt(
    interaction.fields.getTextInputValue('iatext:characters'),
    10,
  );

  if (!Number.isInteger(characters) || characters < 1 || characters > 2000) {
    await interaction.reply({
      content: 'Informe um tamanho entre 1 e 2.000 caracteres.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sessionId = sessions.create({
    userId: interaction.user.id,
    channelId: interaction.channelId,
    outputType,
    idea,
    originalContext: idea,
    targetCharacters: characters,
  });

  await generateAndReply(interaction, sessionId);
}

async function handleCorrectionRequest(interaction) {
  const sessionId = interaction.customId.split(':')[2];
  const session = sessions.beginCorrection(sessionId, interaction.user.id);

  if (!session) {
    await interaction.reply({ content: getStalePreviewMessage(sessionId, interaction.user.id), flags: MessageFlags.Ephemeral });
    return;
  }

  await safelyDisablePreview(interaction.message);

  const modal = new ModalBuilder()
    .setCustomId(`iatext:correction:${sessionId}`)
    .setTitle('Corrigir texto da IA')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('iatext:additional-context')
          .setLabel('O que deve ser alterado?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Ex.: inclua horário, duração e motivo da manutenção.')
          .setRequired(true)
          .setMaxLength(2000),
      ),
    );

  await interaction.showModal(modal);
}

async function handleCorrection(interaction) {
  const sessionId = interaction.customId.split(':')[2];
  const session = sessions.claimCorrection(sessionId, interaction.user.id);

  if (!session) {
    await interaction.reply({ content: getStalePreviewMessage(sessionId, interaction.user.id), flags: MessageFlags.Ephemeral });
    return;
  }

  session.additionalContext = interaction.fields.getTextInputValue('iatext:additional-context');
  await generateAndReply(interaction, sessionId, session);
}

async function handleApprove(interaction) {
  const sessionId = interaction.customId.split(':')[2];
  const session = sessions.claim(sessionId, interaction.user.id);

  if (!session) {
    await interaction.reply({ content: getStalePreviewMessage(sessionId, interaction.user.id), flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.channelId !== session.channelId) {
    sessions.release(sessionId, interaction.user.id);
    await interaction.reply({ content: 'A mensagem precisa ser aprovada no canal original.', flags: MessageFlags.Ephemeral });
    return;
  }

  await disablePreview(interaction);
  const payload = session.outputType === 'embed'
    ? { embeds: [toDiscordEmbed(session.generated)], allowedMentions: { parse: [] } }
    : { content: session.generated.content, allowedMentions: { parse: [] } };

  try {
    await interaction.channel.send(payload);
    sessions.markSent(sessionId, interaction.user.id);
    await safelyEditPreview(interaction, {
      content: '✅ Mensagem enviada com sucesso.',
      embeds: [],
      components: [],
    });
  } catch (error) {
    sessions.release(sessionId, interaction.user.id);
    if (!isUnknownMessage(error)) {
      console.error('Não foi possível publicar o texto aprovado:', error);
    }
    await safelyFollowUp(interaction, {
      content: isUnknownMessage(error)
        ? 'A prévia expirou ou foi removida antes do envio.'
        : 'Não foi possível publicar a mensagem neste canal.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function generateAndReply(interaction, sessionId, claimedSession = null) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const session = claimedSession || sessions.claim(sessionId, interaction.user.id);

  if (!session) {
    await interaction.editReply({
      content: 'Essa sessão já está sendo processada, foi enviada ou expirou.',
      components: [],
    });
    return;
  }

  try {
    session.generated = await openRouterService.generate(session);
    session.currentText = session.outputType === 'embed'
      ? [session.generated.title, session.generated.description]
        .filter(Boolean)
        .join('\n')
      : session.generated.content;
    session.status = 'active';
    session.previewMessage = await interaction.editReply(buildPreview(sessionId, session));
  } catch (error) {
    console.error('Erro ao gerar texto com OpenRouter:', error);
    sessions.remove(sessionId);
    await interaction.editReply({
      content: getFriendlyGenerationError(error),
      components: [],
    });
  }
}

function buildPreview(sessionId, session) {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`iatext:send:${sessionId}`)
      .setLabel('Enviar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`iatext:more:${sessionId}`)
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

function getStalePreviewMessage(sessionId, userId) {
  const status = sessions.getStatus(sessionId, userId);

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

module.exports = { handleIaTextInteraction };