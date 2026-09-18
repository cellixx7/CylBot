const { sanitizeError } = require('../src/lib/logger');
const { REST, Routes } = require('discord.js');
const { getConfig } = require('../src/config/env');
const commands = require('../src/commands');

function loadDiscordConfig() {
  try {
    return getConfig({ requireDiscord: true }).discord;
  } catch (error) {
    if (error && typeof error.message === 'string' && /DISCORD_(TOKEN|CLIENT_ID)/.test(error.message)) {
      throw new Error(
        'Defina DISCORD_TOKEN e DISCORD_CLIENT_ID em bot/.env antes de registrar os comandos. ' +
        'Se ainda não criou o arquivo, copie bot/.env.example para bot/.env e preencha os valores.',
      );
    }

    throw error;
  }
}

const { clientId, token } = loadDiscordConfig();

const rest = new REST({ version: '10' }).setToken(token);
const commandData = commands.map((command) => command.data.toJSON());

async function deployCommands() {
  console.log(`Registrando ${commandData.length} comandos...`);

  await rest.put(Routes.applicationCommands(clientId), {
    body: commandData,
  });

  console.log('Comandos registrados com sucesso.');
}

deployCommands().catch((error) => {
  console.error('Erro ao registrar comandos:', sanitizeError(error));
  process.exitCode = 1;
});