const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { token } = require('./config/env');
const commands = require('./commands');
const readyEvent = require('./events/ready');
const interactionCreateEvent = require('./events/interactionCreate');
const PresenceManager = require('./services/presenceManager');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.commands = new Collection(
  commands.map((command) => [command.data.name, command]),
);
client.presenceManager = new PresenceManager(client);

client.once(readyEvent.name, () => readyEvent.execute(client));
client.on(interactionCreateEvent.name, (interaction) =>
  interactionCreateEvent.execute(interaction, client),
);

client.login(token);