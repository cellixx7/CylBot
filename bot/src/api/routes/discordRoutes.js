const { EmbedBuilder } = require('discord.js');
const { readJson, sendJson } = require('../http/json');
const { clientError } = require('../http/errors');
const { requireSendableChannel } = require('../http/channelPermissions');
const { requireSession } = require('../http/auth');

async function handle(request, response, { client, services, session }) {
  if (request.method !== 'POST' || request.url !== '/api/discord/send') return false;
  const body = await readJson(request);
  const input = validateSendInput(body, services.openRouter);
  const channel = await client.channels.fetch(input.channelId);

  if (!channel?.isTextBased() || !channel.send) {
    throw clientError(400, 'O Channel ID não pertence a um canal de texto enviável.');
  }
  if (!channel.guildId) throw clientError(403, 'FORBIDDEN');
  await services.dashboard.requireManageableGuild(session, channel.guildId);
  requireSession(request, services);
  requireSendableChannel(client, channel, channel.guildId);

  const payload = input.outputType === 'embed'
    ? {
      embeds: [buildEmbed(input.generated)],
      allowedMentions: { parse: [] },
    }
    : {
      content: input.generated.content,
      allowedMentions: { parse: [] },
    };

  await channel.send(payload);
  sendJson(response, 200, { ok: true });
  return true;
}

function validateSendInput(body, openRouterService) {
  if (!/^\d{17,20}$/.test(body?.channelId || '')) {
    throw clientError(400, 'Informe um Channel ID Discord válido.');
  }
  if (!['content', 'embed'].includes(body?.outputType)) {
    throw clientError(400, 'Tipo de mensagem inválido.');
  }
  if (!body.generated || typeof body.generated !== 'object') {
    throw clientError(400, 'A mensagem gerada é obrigatória.');
  }

  let generated;
  try {
    generated = openRouterService.validateOutput(body.generated, body.outputType);
  } catch (error) {
    throw clientError(400, 'Mensagem gerada inválida: confira os campos e limites.');
  }

  return { channelId: body.channelId, outputType: body.outputType, generated };
}

function buildEmbed(generated) {
  const embed = new EmbedBuilder()
    .setDescription(generated.description)
    .setColor(0x5865f2);

  if (generated.title) embed.setTitle(generated.title);
  if (Array.isArray(generated.fields) && generated.fields.length) embed.addFields(generated.fields);
  return embed;
}

module.exports = { handle };
