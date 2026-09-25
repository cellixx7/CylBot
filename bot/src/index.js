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
const { startApiServer } = require('./api/server');
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
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('app.shutdown_started', { signal });
  try {
    if (typeof apiServer?.closeIdleConnections === 'function') apiServer.closeIdleConnections();
    if (typeof apiServer?.closeAllConnections === 'function') apiServer.closeAllConnections();
    if (apiServer?.listening) await new Promise(resolve => apiServer.close(resolve));
    client.destroy();
    client.services?.ticketAIMessages?.stop();
    if (client.services?.database) await client.services.database.close();
    logger.info('app.shutdown_completed', { signal });
  } catch (error) {
    logger.error('app.shutdown_failed', { signal, error: { name: error.name, message: 'cleanup failed' } });
  }
}

process.once('SIGINT', () => { shutdown('SIGINT'); });
process.once('SIGTERM', () => { shutdown('SIGTERM'); });

async function start() {
  client.services = createServices(client, config);
  if (client.services.database) await client.services.database.ping();
  client.presenceManager = client.services.presence;
  client.callSenseManager = client.services.callSense;
  apiServer = startApiServer(client, client.services, config.api);

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
  shutdown('startup_failure');
  process.exitCode = 1;
});
