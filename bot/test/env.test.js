const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { tempDirectory } = require('./helpers/tempDirectory');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const { loadEnv } = require('../src/config/env');
const OpenRouterService = require('../src/services/openRouterService');

const discord = { DISCORD_TOKEN: 'test-token', DISCORD_CLIENT_ID: 'test-client' };

test('Discord exige token e client ID com erros sem valores sensíveis', () => {
  assert.throws(() => loadEnv({}), /DISCORD_TOKEN.*não foi definida/);
  assert.throws(() => loadEnv({ DISCORD_TOKEN: 'confidential' }), /DISCORD_CLIENT_ID.*não foi definida/);
  assert.throws(() => loadEnv({ ...discord, DISCORD_TOKEN: '  ' }), /DISCORD_TOKEN/);
  assert.throws(() => loadEnv({ ...discord, API_PORT: 'confidential' }), error => {
    assert.match(error.message, /API_PORT/);
    assert.equal(error.message.includes('confidential'), false);
    assert.equal(error.message.includes(discord.DISCORD_TOKEN), false);
    return true;
  });
});

test('porta aplica default e converte inteiros válidos', () => {
  assert.equal(loadEnv(discord).api.port, 3001);
  assert.equal(loadEnv({ ...discord, API_PORT: ' 4000 ' }).api.port, 4000);
  for (const port of ['1', '65535']) assert.equal(loadEnv({ ...discord, API_PORT: port }).api.port, Number(port));
});

test('porta rejeita NaN, sufixos, frações e valores fora da faixa', () => {
  for (const port of ['abc', '3001abc', '1.5', '0', '-1', '65536', '1e3', 'Infinity']) {
    assert.throws(() => loadEnv({ ...discord, API_PORT: port }), /API_PORT/);
  }
});

test('OpenRouter mantém defaults e teto de 800 com validação estrita', () => {
  assert.deepEqual(loadEnv(discord).openRouter, { apiKey: undefined, model: 'openai/gpt-4.1-mini', maxTokens: 800 });
  assert.equal(loadEnv({ ...discord, OPENROUTER_MAX_TOKENS: '100' }).openRouter.maxTokens, 100);
  assert.equal(loadEnv({ ...discord, OPENROUTER_MAX_TOKENS: '2000' }).openRouter.maxTokens, 800);
  for (const tokens of ['0', '-10', 'abc', '800abc', '1.5', '9007199254740992']) {
    assert.throws(() => loadEnv({ ...discord, OPENROUTER_MAX_TOKENS: tokens }), /OPENROUTER_MAX_TOKENS/);
  }
});

test('Spotify e IA ausentes ou Spotify parcial não impedem configuração do bot', () => {
  const config = loadEnv(discord);
  assert.equal(config.spotify.clientId, undefined);
  assert.equal(config.spotify.refreshToken, undefined);
  assert.equal(config.spotify.redirectUri, 'http://127.0.0.1:8888/callback');
  assert.equal(loadEnv({ ...discord, SPOTIFY_CLIENT_ID: 'partial' }).spotify.clientId, 'partial');
  assert.equal(config.tools.browser, 'xdg-open');
});

test('strings opcionais são normalizadas sem mutar o source', () => {
  const source = { ...discord, OPENROUTER_API_KEY: ' key ', OPENROUTER_MODEL: ' model ',
    SPOTIFY_CLIENT_ID: ' client ', SPOTIFY_CLIENT_SECRET: ' secret ', SPOTIFY_REFRESH_TOKEN: ' refresh ',
    SPOTIFY_PLAYLIST_ID: ' spotify:playlist:test ', BROWSER: ' browser ', API_PORT: '  ',
  };
  const before = { ...source };
  const config = loadEnv(source);
  assert.deepEqual(source, before);
  assert.equal(config.openRouter.apiKey, 'key');
  assert.equal(config.openRouter.model, 'model');
  assert.equal(config.spotify.clientSecret, 'secret');
  assert.equal(config.spotify.refreshToken, 'refresh');
  assert.equal(config.spotify.playlistId, 'spotify:playlist:test');
  assert.equal(config.tools.browser, 'browser');
  assert.equal(config.api.port, 3001);
  assert.equal(loadEnv({ ...discord, OPENROUTER_API_KEY: '  ' }).openRouter.apiKey, undefined);
  assert.equal(loadEnv({ ...discord, OPENROUTER_MODEL: '  ' }).openRouter.model, 'openai/gpt-4.1-mini');
});

test('redirect Spotify valida protocolo e não expõe URL inválida', () => {
  const valid = 'https://example.com/callback';
  assert.equal(loadEnv({ ...discord, SPOTIFY_REDIRECT_URI: ` ${valid} ` }).spotify.redirectUri, valid);
  for (const uri of ['invalid-private', 'file:///private', 'https://user:private@example.com/callback', 'https://example.com/#private']) {
    assert.throws(() => loadEnv({ ...discord, SPOTIFY_REDIRECT_URI: uri }), error => {
      assert.match(error.message, /SPOTIFY_REDIRECT_URI/);
      assert.equal(error.message.includes('private'), false);
      return true;
    });
  }
});

test('auxiliar Spotify exige apenas suas credenciais, sem Discord', () => {
  const options = { requireDiscord: false, requireSpotifyAuth: true };
  assert.throws(() => loadEnv({}, options), /SPOTIFY_CLIENT_ID/);
  assert.throws(() => loadEnv({ SPOTIFY_CLIENT_ID: 'test' }, options), /SPOTIFY_CLIENT_SECRET/);
  const config = loadEnv({ SPOTIFY_CLIENT_ID: 'test', SPOTIFY_CLIENT_SECRET: 'test' }, options);
  assert.equal(config.discord.token, undefined);
  assert.equal(config.spotify.refreshToken, undefined);
});

test('provider consome configuração injetada e falha sem chave apenas ao gerar', async () => {
  const config = loadEnv({ OPENROUTER_MODEL: 'custom/model', OPENROUTER_MAX_TOKENS: '50' }, { requireDiscord: false });
  const provider = new OpenRouterService(config.openRouter);
  assert.equal(provider.modelName, 'custom/model');
  assert.equal(provider.maxTokens, 50);
  await assert.rejects(provider.generate({}), /OPENROUTER_API_KEY/);
});

test('entrypoints falham antes de iniciar operações externas sem credenciais', t => {
  const cwd = tempDirectory(t, 'cylbot-config-');
  for (const [script, variable] of [
    ['src/index.js', 'DISCORD_TOKEN'], ['scripts/deploy-commands.js', 'DISCORD_TOKEN'], ['scripts/spotify-auth.js', 'SPOTIFY_CLIENT_ID'],
  ]) {
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', script)], { cwd, env: {}, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(variable));
    assert.equal(result.stdout, '');
  }
});

test('somente env.js acessa o ambiente e o exemplo cobre todas as variáveis', () => {
  const bot = path.join(__dirname, '..');
  const envFile = path.join(bot, 'src/config/env.js');
  function inspect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (file.endsWith('.js') && file !== envFile) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /process\s*(?:\.\s*env|\[\s*['"]env['"]\s*\])/);
      }
    }
  }
  inspect(path.join(bot, 'src'));
  inspect(path.join(bot, 'scripts'));
  const source = fs.readFileSync(envFile, 'utf8');
  const names = [...source.matchAll(/(?:optional|integer)\(source, '([^']+)'/g)].map(match => match[1]).sort();
  const example = dotenv.parse(fs.readFileSync(path.join(bot, '.env.example')));
  assert.deepEqual(Object.keys(example).sort(), names);
  assert.doesNotThrow(() => loadEnv(example));
});


test('LOG_LEVEL usa info, normaliza nível e rejeita valores desconhecidos sem expô-los', () => {
  assert.equal(loadEnv(discord).logging.level, 'info');
  assert.equal(loadEnv({ ...discord, LOG_LEVEL: ' DEBUG ' }).logging.level, 'debug');
  for (const level of ['info', 'warn', 'error']) assert.equal(loadEnv({ ...discord, LOG_LEVEL: level }).logging.level, level);
  assert.throws(() => loadEnv({ ...discord, LOG_LEVEL: 'private-value' }), error => {
    assert.match(error.message, /LOG_LEVEL/);
    assert.equal(error.message.includes('private-value'), false);
    return true;
  });
});

test('OAuth é opcional, reutiliza Client ID e valida habilitação sem expor secret', () => {
  const config = loadEnv({}, { requireDiscord: false });
  assert.equal(config.auth.enabled, false);
  assert.equal(config.auth.webOrigin, 'http://localhost:5173');
  assert.equal(config.auth.redirectUri, 'http://localhost:5173/api/auth/discord/callback');
  assert.equal(config.auth.secure, false);
  assert.equal(config.auth.sessionTtlSeconds, 28800);
  const enabled = loadEnv({ ...discord, DISCORD_OAUTH_CLIENT_SECRET: ' fake-secret ' });
  assert.equal(enabled.auth.enabled, true);
  assert.equal(enabled.auth.clientId, enabled.discord.clientId);
  assert.equal(enabled.auth.clientSecret, 'fake-secret');
  assert.throws(() => loadEnv({ DISCORD_OAUTH_CLIENT_SECRET: 'private-value' }, { requireDiscord: false }), error => {
    assert.match(error.message, /DISCORD_CLIENT_ID/);
    assert.equal(error.message.includes('private-value'), false);
    return true;
  });
});

test('OAuth exige origem/callback coerentes e HTTPS fora do desenvolvimento local', () => {
  const config = loadEnv({ ...discord, WEB_ORIGIN: 'https://cyl.example' });
  assert.equal(config.auth.secure, true);
  assert.equal(config.auth.redirectUri, 'https://cyl.example/api/auth/discord/callback');
  for (const origin of ['*', 'http://cyl.example', 'https://cyl.example/path', 'https://user:private@cyl.example', 'https://cyl.example?private', 'https://cyl.example/#private']) {
    assert.throws(() => loadEnv({ ...discord, WEB_ORIGIN: origin }), /WEB_ORIGIN/);
  }
  for (const redirect of ['http://127.0.0.1:3001/api/auth/discord/callback', 'http://localhost:5173/other', 'http://localhost:5173/api/auth/discord/callback?private', 'invalid-private']) {
    assert.throws(() => loadEnv({ ...discord, DISCORD_OAUTH_REDIRECT_URI: redirect }), error => {
      assert.match(error.message, /DISCORD_OAUTH_REDIRECT_URI/);
      assert.equal(error.message.includes('private'), false);
      return true;
    });
  }
});

test('SESSION_TTL_SECONDS exige inteiro positivo limitado a trinta dias', () => {
  for (const value of ['1', '3600', '2592000']) assert.equal(loadEnv({ ...discord, SESSION_TTL_SECONDS: value }).auth.sessionTtlSeconds, Number(value));
  for (const value of ['0', '-1', '1.5', 'abc', '2592001']) assert.throws(() => loadEnv({ ...discord, SESSION_TTL_SECONDS: value }), /SESSION_TTL_SECONDS/);
});
