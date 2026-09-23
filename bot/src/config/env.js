const dotenv = require('dotenv');

function optional(source, name) {
  const value = source[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function detectCodespaceOrigin(source) {
  const codespaces = optional(source, 'CODESPACES') === 'true';
  const name = optional(source, 'CODESPACE_NAME');
  const domain = optional(source, 'GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN') || 'app.github.dev';
  if (codespaces && name && /^[a-z0-9-]+$/i.test(name) && /^[a-z0-9.-]+$/i.test(domain)) {
    return `https://${name}-5173.${domain}`;
  }
  return undefined;
}

function integer(source, name, fallback, max = Number.MAX_SAFE_INTEGER) {
  const value = optional(source, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} deve ser um inteiro entre 1 e ${max}.`);
  }
  return parsed;
}

function validateRequired(config, { requireDiscord = false, requireSpotifyAuth = false } = {}) {
  const required = [];
  if (requireDiscord) required.push(['DISCORD_TOKEN', config.discord.token], ['DISCORD_CLIENT_ID', config.discord.clientId]);
  if (requireSpotifyAuth) required.push(['SPOTIFY_CLIENT_ID', config.spotify.clientId], ['SPOTIFY_CLIENT_SECRET', config.spotify.clientSecret]);
  for (const [name, value] of required) {
    if (!value) throw new Error(`A variável de ambiente ${name} não foi definida.`);
  }
  return config;
}

function loadEnv(source, { requireDiscord = true, requireSpotifyAuth = false } = {}) {
  const environment = optional(source, 'NODE_ENV') || 'development';
  const codespaceOrigin = detectCodespaceOrigin(source);
  const webOrigin = optional(source, 'WEB_ORIGIN') || codespaceOrigin || 'http://localhost:5173';
  const allowedOrigins = [...new Set([
    webOrigin,
    ...(environment === 'production' ? [] : [
      'http://localhost:5173', 'http://127.0.0.1:5173', codespaceOrigin,
    ]),
  ].filter(Boolean))];
  const oauthRedirectUri = optional(source, 'DISCORD_OAUTH_REDIRECT_URI') || `${webOrigin}/api/auth/discord/callback`;
  for (const [name, value] of [['WEB_ORIGIN', webOrigin], ['DISCORD_OAUTH_REDIRECT_URI', oauthRedirectUri]]) {
    try {
      const url = new URL(value);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error();
      if (name === 'WEB_ORIGIN' && value !== url.origin) throw new Error();
      if (name === 'DISCORD_OAUTH_REDIRECT_URI' && (url.origin !== webOrigin || url.pathname !== '/api/auth/discord/callback')) throw new Error();
    } catch {
      throw new Error(`${name} deve usar HTTPS (HTTP somente local), sem credenciais/query/fragmento; callback deve estar na origem WEB_ORIGIN e em /api/auth/discord/callback.`);
    }
  }
  const oauthSecret = optional(source, 'DISCORD_OAUTH_CLIENT_SECRET');
  const oauthClientId = optional(source, 'DISCORD_CLIENT_ID');
  if (oauthSecret && !oauthClientId) throw new Error('DISCORD_CLIENT_ID é obrigatório para OAuth Web.');
  const redirectUri = optional(source, 'SPOTIFY_REDIRECT_URI') || 'http://127.0.0.1:8888/callback';
  try {
    const url = new URL(redirectUri);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error();
  } catch {
    throw new Error('SPOTIFY_REDIRECT_URI deve ser uma URL HTTP(S) válida, sem credenciais ou fragmento.');
  }
  const logLevel = (optional(source, 'LOG_LEVEL') || 'info').toLowerCase();
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error('LOG_LEVEL deve ser debug, info, warn ou error.');
  }
  const databaseUrl = optional(source, 'DATABASE_URL');
  const config = {
    auth: {
      enabled: Boolean(oauthSecret), clientId: oauthClientId, clientSecret: oauthSecret,
      redirectUri: oauthRedirectUri, webOrigin, allowedOrigins,
      secure: webOrigin.startsWith('https:'),
      sessionTtlSeconds: integer(source, 'SESSION_TTL_SECONDS', 28800, 2592000),
    },
    logging: { level: logLevel },
    discord: {
      token: optional(source, 'DISCORD_TOKEN'),
      clientId: oauthClientId,
    },
    api: { port: integer(source, 'API_PORT', 3001, 65535) },
    database: { url: databaseUrl },
    tickets: { messageContentEnabled: optional(source, 'TICKETS_MESSAGE_CONTENT_ENABLED') === 'true' },
    openRouter: {
      apiKey: optional(source, 'OPENROUTER_API_KEY'),
      model: optional(source, 'OPENROUTER_MODEL') || 'openai/gpt-4.1-mini',
      maxTokens: Math.min(integer(source, 'OPENROUTER_MAX_TOKENS', 800), 800),
    },
    spotify: {
      clientId: optional(source, 'SPOTIFY_CLIENT_ID'),
      clientSecret: optional(source, 'SPOTIFY_CLIENT_SECRET'),
      redirectUri,
      refreshToken: optional(source, 'SPOTIFY_REFRESH_TOKEN'),
      playlistId: optional(source, 'SPOTIFY_PLAYLIST_ID'),
    },
    tools: { browser: optional(source, 'BROWSER') || 'xdg-open' },
  };
  return validateRequired(config, { requireDiscord, requireSpotifyAuth });
}

let runtimeConfig;
function getConfig(options = {}) {
  if (!runtimeConfig) {
    // Mantém a resolução de .env pelo diretório de execução, como antes.
    dotenv.config();
    runtimeConfig = loadEnv(process.env, { requireDiscord: false });
  }
  // Importar um módulo/testar o provider não exige credenciais Discord.
  // Os entrypoints solicitam explicitamente os requisitos da operação.
  return validateRequired(runtimeConfig, options);
}

module.exports = { loadEnv, getConfig };
