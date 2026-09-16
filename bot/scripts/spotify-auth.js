const { sanitizeError } = require('../src/lib/logger');
/*
 * Utilitário de configuração inicial do Spotify.
 * Execute uma vez para gerar o SPOTIFY_REFRESH_TOKEN.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getConfig } = require('../src/config/env');

const config = getConfig({ requireSpotifyAuth: true });

const REDIRECT_URI = config.spotify.redirectUri;
const callbackUrl = new URL(REDIRECT_URI);
const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
];

const { clientId, clientSecret } = config.spotify;

const state = crypto.randomBytes(24).toString('hex');
const authorizationUrl = new URL('https://accounts.spotify.com/authorize');
authorizationUrl.search = new URLSearchParams({
  client_id: clientId,
  response_type: 'code',
  redirect_uri: REDIRECT_URI,
  state,
  scope: SCOPES.join(' '),
}).toString();

function openAuthorizationPage(url) {
  const command = config.tools.browser;
  const args = [url];

  execFile(command, args, { stdio: 'ignore' }, (error) => {
    if (error) {
      console.log('Não foi possível abrir o navegador automaticamente.');
      console.log('Abra manualmente a URL exibida acima.');
    }
  });
}

async function exchangeCode(code) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    throw new Error(`Spotify respondeu com HTTP ${response.status} ao trocar o código.`);
  }

  const token = await response.json();

  if (!token.refresh_token) {
    throw new Error('A resposta do Spotify não trouxe um refresh_token.');
  }

  return token.refresh_token;
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, REDIRECT_URI);

  if (requestUrl.pathname !== callbackUrl.pathname) {
    response.writeHead(404).end('Rota não encontrada.');
    return;
  }

  if (requestUrl.searchParams.get('error')) {
    response.writeHead(400).end('Autorização cancelada no Spotify. Você pode fechar esta aba.');
    server.close();
    console.error('Autorização cancelada no Spotify.');
    return;
  }

  if (requestUrl.searchParams.get('state') !== state) {
    response.writeHead(400).end('State inválido. Você pode fechar esta aba.');
    server.close();
    console.error('State inválido recebido no callback.');
    return;
  }

  const code = requestUrl.searchParams.get('code');

  if (!code) {
    response.writeHead(400).end('Código de autorização ausente.');
    server.close();
    console.error('Código de autorização ausente no callback.');
    return;
  }

  try {
    const refreshToken = await exchangeCode(code);
    const tokenDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cylbot-spotify-'));
    const tokenFile = path.join(tokenDirectory, 'refresh-token');
    fs.writeFileSync(tokenFile, refreshToken, { mode: 0o600 });
    response.writeHead(200).end('Autorização concluída. Você pode fechar esta aba.');
    console.log('\nSpotify autorizado com sucesso.');
    console.log(`Refresh token salvo em arquivo privado: ${tokenFile}`);
    console.log('Copie o conteúdo para SPOTIFY_REFRESH_TOKEN no .env e remova o arquivo temporário.');
  } catch (error) {
    response.writeHead(500).end('Falha ao concluir a autorização. Você pode fechar esta aba.');
    console.error(`Não foi possível gerar o refresh token: ${sanitizeError(error).message}`);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`A porta ${callbackUrl.port} já está em uso. Feche o processo que a utiliza e tente novamente.`);
  } else {
    console.error(`Não foi possível iniciar o callback local: ${sanitizeError(error).message}`);
  }
  process.exitCode = 1;
});

server.listen(8888, '0.0.0.0', () => {
  console.log('Script de configuração inicial do Spotify.');
  console.log(`Redirect URI usada: ${REDIRECT_URI}`);
  console.log('Servidor local ouvindo em 0.0.0.0:8888');
  console.log('\nAbra esta URL para autorizar o acesso:');
  console.log(authorizationUrl.toString());

  openAuthorizationPage(authorizationUrl.toString());
});