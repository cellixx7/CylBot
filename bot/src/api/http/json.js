const { clientError } = require('./errors');

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk) => {
      data += chunk;
      if (data.length > 20_000) reject(clientError(413, 'Requisição muito grande.'));
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        reject(clientError(400, 'JSON inválido.'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

module.exports = { readJson, sendJson };
