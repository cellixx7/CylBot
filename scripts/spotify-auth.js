/*
 * Utilitário de configuração inicial do Spotify.
 * Execute uma vez para gerar o SPOTIFY_REFRESH_TOKEN.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const dotenv = require('dotenv');

dotenv.config();

const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI ||
  "http://127.0.0.1:8888/callback";
const callbackUrl = new URL(REDIRECT_URI);
const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
];

const { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_CLIENT_SECRET: clientSecret } = process.env;

if (!clientId || !clientSecret) {
  console.error('Defina SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no arquivo .env.');
  process.exitCode = 1;
  return;
}

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
  const browser = process.env.BROWSER;
  const command = browser || 'xdg-open';
  const args = browser ? [url] : [url];

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
    response.writeHead(200).end('Autorização concluída. Você pode fechar esta aba.');
    console.log('\nSpotify autorizado com sucesso.');
    console.log('Copie este valor para SPOTIFY_REFRESH_TOKEN no arquivo .env:');
    console.log(refreshToken);
  } catch (error) {
    response.writeHead(500).end('Falha ao concluir a autorização. Você pode fechar esta aba.');
    console.error(`Não foi possível gerar o refresh token: ${error.message}`);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`A porta ${callbackUrl.port} já está em uso. Feche o processo que a utiliza e tente novamente.`);
  } else {
    console.error(`Não foi possível iniciar o callback local: ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(Number(callbackUrl.port) || 80, callbackUrl.hostname, () => {
  console.log('Script de configuração inicial do Spotify.');
  console.log('Este script gera o refresh token e não é necessário para executar o bot depois.');
  console.log('\nAbra esta URL para autorizar o acesso:');
  console.log(authorizationUrl.toString());
  console.log('\nAguardando o callback em http://127.0.0.1:8888/callback ...');
  openAuthorizationPage(authorizationUrl.toString());
});