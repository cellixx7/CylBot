const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { getConfig } = require('./config/env');
const config = getConfig({ requireDiscord: true });
const commands = require('./commands');
const readyEvent = require('./events/ready');
const interactionCreateEvent = require('./events/interactionCreate');
const voiceStateUpdateEvent = require('./events/voiceStateUpdate');
const { createServices } = require('./app/createServices');
const { startApiServer } = require('./api/server');
const { logger } = require('./lib/logger');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates,
    ...(config.tickets.messageContentEnabled ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] : []),
  ],
});

client.commands = new Collection(
  commands.map((command) => [command.data.name, command]),
);
async function start() {
  client.services = createServices(client, config);
  if (client.services.database) await client.services.database.ping();
  client.presenceManager = client.services.presence;
  client.callSenseManager = client.services.callSense;
  startApiServer(client, client.services, config.api);

  client.once(readyEvent.name, () => readyEvent.execute(client));
  client.on(interactionCreateEvent.name, (interaction) =>
    interactionCreateEvent.execute(interaction, client),
  );
  client.on(voiceStateUpdateEvent.name, (oldState, newState) =>
    voiceStateUpdateEvent.execute(oldState, newState, client),
  );

  await client.login(config.discord.token);
}

start().catch(error => {
  logger.error('app.start_failed', { error });
  process.exitCode = 1;
});
