const { sanitizeError } = require('../src/lib/logger');
const { REST, Routes } = require('discord.js');
const { getConfig } = require('../src/config/env');
const { clientId, token } = getConfig({ requireDiscord: true }).discord;
const commands = require('../src/commands');

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