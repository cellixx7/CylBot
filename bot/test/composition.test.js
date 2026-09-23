require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { loadEnv } = require('../src/config/env');
const { createServices } = require('../src/app/createServices');
const { startApiServer } = require('../src/api/server');
const event = require('../src/events/interactionCreate');
const commands = require('../src/commands');

const config = () => loadEnv({}, { requireDiscord: false });
const client = () => ({ isReady: () => true, guilds: { cache: new Map() } });

test('composition root compartilha providers, services e repository sem iniciar operações externas', () => {
  const bot = client();
  const services = createServices(bot, config());
  assert.equal(services.textaAI.ai, services.openRouter);
  assert.equal(services.ticketAI.provider, services.openRouter);
  assert.equal(services.ticketAI.tickets, services.tickets);
  assert.equal(services.ticketAI.context.adapter, services.tickets.adapter);
  assert.equal(services.ticketAI.repository, null);
  assert.equal(services.announcements.ai, services.openRouter);
  assert.equal(services.auth.provider, services.dashboard.provider);
  assert.equal(services.dashboard.client, bot);
  assert.equal(services.presence.client, bot);
  assert.equal(services.callSense.client, bot);
  assert(services.announcements.repository);
  assert(services.announcements.draftManager);
  assert(services.textaAI.sessions);
  assert.notEqual(services.auth.sessions, services.textaAI.sessions);
  assert.equal(services.tickets.configs, services.ticketSetup.repository);
  assert.equal(services.tickets.adapter, services.ticketSetup.adapter);
  assert.equal(services.tickets.permissions, services.ticketSetup.permissions);
  assert.equal(services.tickets.transcripts.adapter, services.tickets.adapter);
  const other = createServices(bot, config());
  assert.notEqual(other.openRouter, services.openRouter);
  assert.notEqual(other.textaAI.sessions, services.textaAI.sessions);
  assert.notEqual(other.announcements.repository, services.announcements.repository);
});

test('startApiServer entrega services injetados às rotas sem recriar dependências', async t => {
  const bot = client();
  const settings = config();
  const services = createServices(bot, settings);
  const session = services.auth.sessions.create({ id: 'composition-user' }, { access_token: 'synthetic', expires_in: 3600, scope: 'identify guilds' });
  let generations = 0;
  t.mock.method(services.textaAI, 'generate', async () => { generations++; return { content: 'Serviço compartilhado' }; });
  const server = startApiServer(bot, services, { port: 0 });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, 'listening');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/generate`, {
    method: 'POST', headers: { Origin: settings.auth.webOrigin, Cookie: `cylbot_session=${session.id}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ outputType: 'content', idea: 'Ideia', targetCharacters: 100 }),
  });
  assert.equal(response.status, 200);
  assert.equal(generations, 1);
  assert.deepEqual(await response.json(), { generated: { content: 'Serviço compartilhado' } });
});

test('registry entrega os services do client aos handlers Discord e ao comando anúncios', async () => {
  const services = createServices(client(), config());
  const bot = { services, commands };
  services.announcements.repository = { getCategories: () => [{ id: 'injected', name: 'Injetada', title: 'Título' }] };
  let payload;
  await event.execute({ client: bot, customId: 'ann:back', guildId: 'guild', update: async value => { payload = value; } }, bot);
  assert.equal(payload.components[0].toJSON().components[0].options[0].value, 'injected');
  const expected = services.textaAI.create({ userId: 'user', channelId: 'channel', outputType: 'content', idea: 'Ideia', targetCharacters: 100 });
  // Uma sessão do root precisa ser encontrada pelo handler; um singleton diferente retornaria "expirada".
  await event.execute({ client: bot, customId: `texta_ai:more:${expected}`, user: { id: 'user' },
    message: { components: [], edit: async () => {} },
    isModalSubmit: () => false, isButton: () => true, showModal: async value => { payload = value.toJSON(); } }, bot);
  assert.equal(payload.custom_id, `texta_ai:correction:${expected}`);
  await commands.find(command => command.data.name === 'anuncios').execute({ client: bot, guildId: 'guild', reply: async value => { payload = value; } });
  assert.equal(payload.components[0].toJSON().components[0].options[0].value, 'injected');
});

test('registry preserva ordem e para no primeiro true antes de despachar slash command', async () => {
  const calls = [];
  const services = {};
  const interaction = { isChatInputCommand: () => { calls.push('command'); return true; } };
  await event.execute(interaction, { services }, [
    async (received, context) => { assert.equal(received, interaction); assert.equal(context, services); calls.push('first'); return false; },
    async () => { calls.push('second'); return true; },
    async () => assert.fail('Não deve executar o próximo handler'),
  ]);
  assert.deepEqual(calls, ['first', 'second']);
});

test('registry faz fallback para comandos e ignora interações sem handler', async () => {
  let executions = 0;
  const bot = { services: {}, commands: [{ data: { name: 'test' }, execute: async () => { executions++; } }] };
  const interaction = { isModalSubmit: () => false, isButton: () => false, isChatInputCommand: () => true, commandName: 'test' };
  await event.execute(interaction, bot);
  assert.equal(executions, 1);
  await event.execute({ ...interaction, isChatInputCommand: () => false }, bot);
  assert.equal(executions, 1);
});

test('registry oficial preserva todos os slash commands existentes', () => {
  assert.deepEqual(commands.map(command => command.data.toJSON().name).sort(),
    ['anuncios', 'callsense', 'embed', 'ping', 'presence', 'say', 'texta_ai', 'ticket']);
});
