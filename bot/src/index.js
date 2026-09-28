const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const { getConfig } = require('./config/env');
const config = getConfig({ requireDiscord: true });
const commands = require('./commands/index');
const readyEvent = require('./events/ready');
const interactionCreateEvent = require('./events/interactionCreate');
const voiceStateUpdateEvent = require('./events/voiceStateUpdate');
const messageCreateEvent = require('./events/messageCreate');
const messageUpdateEvent = require('./events/messageUpdate');
const channelDeleteEvent = require('./events/channelDelete');
const { createServices } = require('./app/createServices');
const { createShutdown } = require('./app/shutdown');
const { startApiServer, waitForServerListening } = require('./api/server');
const { logger } = require('./lib/logger');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates,
    ...(config.tickets.messageContentEnabled ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] : []),
  ],
  partials: config.tickets.messageContentEnabled ? [Partials.Message] : [],
});

client.commands = new Collection(
  commands.map((command) => [command.data.name, command]),
);
let apiServer;
const shutdown = createShutdown({
  getServer: () => apiServer,
  getClient: () => client,
  logger,
});

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

async function start() {
  client.services = createServices(client, config);
  if (client.services.database) await client.services.database.ping();
  client.presenceManager = client.services.presence;
  client.callSenseManager = client.services.callSense;
  apiServer = startApiServer(client, client.services, config.api);
  await waitForServerListening(apiServer);

  client.once(readyEvent.name, () => readyEvent.execute(client));
  client.on(interactionCreateEvent.name, (interaction) =>
    interactionCreateEvent.execute(interaction, client),
  );
  client.on(voiceStateUpdateEvent.name, (oldState, newState) =>
    voiceStateUpdateEvent.execute(oldState, newState, client),
  );
  client.on(messageCreateEvent.name, message => messageCreateEvent.execute(message, client));
  client.on(messageUpdateEvent.name, (oldMessage, newMessage) =>
    messageUpdateEvent.execute(oldMessage, newMessage, client));
  client.on(channelDeleteEvent.name, channel => channelDeleteEvent.execute(channel, client));

  await client.login(config.discord.token);
}

start().catch(error => {
  logger.error('app.start_failed', { error });
  process.exitCode = 1;
  void shutdown('startup_failure');
});
