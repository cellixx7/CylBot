const test = require('node:test');
const assert = require('node:assert/strict');

const OpenRouterService = require('../src/services/openRouterService');
const { loadEnv } = require('../src/config/env');
const { DiscordOAuthProvider } = require('../src/providers/discordOAuthProvider');

function smokeConfig() {
  return loadEnv({
    NODE_ENV: 'test',
    DISCORD_CLIENT_ID: '123456789012345678',
    DISCORD_OAUTH_CLIENT_SECRET: 'discord-secret',
    DISCORD_OAUTH_REDIRECT_URI: 'https://example.test/api/auth/discord/callback',
    WEB_ORIGIN: 'https://example.test',
    SPOTIFY_CLIENT_ID: 'spotify-client',
    SPOTIFY_CLIENT_SECRET: 'spotify-secret',
    SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:8888/callback',
    OPENROUTER_MODEL: 'openai/gpt-4.1-mini',
  });
}

test('smoke: configuração dos providers externos é válida', () => {
  const config = smokeConfig();

  assert.equal(config.auth.enabled, true);
  assert.equal(config.auth.redirectUri, 'https://example.test/api/auth/discord/callback');
  assert.equal(config.spotify.redirectUri, 'http://127.0.0.1:8888/callback');
  assert.equal(config.openRouter.model, 'openai/gpt-4.1-mini');
});

test('smoke: contrato de autorização e guilds do Discord permanece compatível', async () => {
  const config = smokeConfig();
  const calls = [];
  const provider = new DiscordOAuthProvider(config.auth, async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return [{ id: '123456789012345678', name: 'Servidor de teste', owner: true, permissions: '8' }];
      },
    };
  });

  const authorization = new URL(provider.authorizationUrl('smoke-state'));
  assert.equal(authorization.hostname, 'discord.com');
  assert.equal(authorization.searchParams.get('client_id'), '123456789012345678');
  assert.equal(authorization.searchParams.get('state'), 'smoke-state');
  assert.equal(authorization.searchParams.get('scope'), 'identify guilds');

  const guilds = await provider.getCurrentUserGuilds('fake-access-token');
  assert.deepEqual(guilds, [{
    id: '123456789012345678',
    name: 'Servidor de teste',
    icon: null,
    owner: true,
    permissions: '8',
  }]);
  assert.match(calls[0].url, /discord\.com\/api\/v10\/users\/@me\/guilds/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fake-access-token');
});

test('smoke: contrato local do OpenRouter valida content e embed sem chamada de rede', () => {
  const service = new OpenRouterService({
    apiKey: 'fake-key',
    model: 'openai/gpt-4.1-mini',
    maxTokens: 100,
  });

  const contentFormat = service.getResponseFormat('content');
  const embedFormat = service.getResponseFormat('embed');
  assert.equal(contentFormat.json_schema.name, 'discord_content');
  assert.equal(embedFormat.json_schema.name, 'discord_embed');
  assert.deepEqual(service.validateOutput({ content: 'Mensagem de smoke.' }, 'content'), {
    content: 'Mensagem de smoke.',
  });
  assert.deepEqual(service.validateOutput({ title: 'Teste', description: 'Descrição', fields: [] }, 'embed'), {
    title: 'Teste',
    description: 'Descrição',
    fields: [],
  });
});

test('smoke: Spotify aceita configuração de callback segura', () => {
  const config = smokeConfig();
  const callback = new URL(config.spotify.redirectUri);

  assert.equal(callback.protocol, 'http:');
  assert.equal(callback.hostname, '127.0.0.1');
  assert.equal(callback.pathname, '/callback');
});
