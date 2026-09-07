const http = require('node:http');
const { EmbedBuilder } = require('discord.js');
const OpenRouterService = require('../services/openRouterService');

const MAX_INPUT_LENGTH = 2000;
const MAX_TARGET_CHARACTERS = 2000;
const openRouterService = new OpenRouterService();

function startApiServer(client) {
  const port = Number.parseInt(process.env.API_PORT || '3001', 10);
  const server = http.createServer(async (request, response) => {
    setCorsHeaders(response);

    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    try {
      if (request.method === 'GET' && request.url === '/api/health') {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === 'POST' && request.url === '/api/ai/generate') {
        await handleGenerate(request, response);
        return;
      }

      if (request.method === 'POST' && request.url === '/api/discord/send') {
        await handleSend(request, response, client);
        return;
      }

      sendJson(response, 404, { error: 'Rota não encontrada.' });
    } catch (error) {
      console.error('Erro na API web:', error.message);
      sendJson(response, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'Não foi possível concluir a operação.',
      });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`API web disponível em http://127.0.0.1:${port}`);
  });

  server.on('error', (error) => {
    console.error(`Não foi possível iniciar a API web: ${error.message}`);
  });

  return server;
}

async function handleGenerate(request, response) {
  const body = await readJson(request);
  const input = validateGenerationInput(body);
  const generated = await openRouterService.generate(input);
  sendJson(response, 200, { generated });
}

async function handleSend(request, response, client) {
  const body = await readJson(request);
  const input = validateSendInput(body);
  const channel = await client.channels.fetch(input.channelId);

  if (!channel?.isTextBased() || !channel.send) {
    throw clientError(400, 'O Channel ID não pertence a um canal de texto enviável.');
  }

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
}

function validateGenerationInput(body) {
  const outputType = body?.outputType;
  const idea = normalizeText(body?.idea);
  const originalContext = normalizeText(body?.originalContext || idea);
  const additionalContext = normalizeText(body?.additionalContext);
  const currentText = normalizeText(body?.currentText);
  const targetCharacters = Number(body?.targetCharacters);

  if (!['content', 'embed'].includes(outputType)) {
    throw clientError(400, 'Escolha Content ou Embed.');
  }
  if (!idea || idea.length > MAX_INPUT_LENGTH) {
    throw clientError(400, 'A ideia deve ter entre 1 e 2.000 caracteres.');
  }
  if (originalContext.length > MAX_INPUT_LENGTH || additionalContext.length > MAX_INPUT_LENGTH || currentText.length > MAX_INPUT_LENGTH) {
    throw clientError(400, 'Os textos informados não podem ultrapassar 2.000 caracteres.');
  }
  if (!Number.isInteger(targetCharacters) || targetCharacters < 20 || targetCharacters > MAX_TARGET_CHARACTERS) {
    throw clientError(400, 'O tamanho deve ser um número entre 20 e 2.000 caracteres.');
  }

  return { outputType, idea, originalContext, additionalContext, currentText, targetCharacters };
}

function validateSendInput(body) {
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
    throw clientError(400, `Mensagem gerada inválida: ${error.message}`);
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

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clientError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk) => {
      data += chunk;
      if (data.length > 20_000) reject(clientError(413, 'Requisição muito grande.'));
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        reject(clientError(400, 'JSON inválido.'));
      }
    });
    request.on('error', reject);
  });
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

module.exports = { startApiServer };