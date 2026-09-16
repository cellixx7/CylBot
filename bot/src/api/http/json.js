const { clientError } = require('./errors');

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let chunks = [];
    let rejected = false;
    request.on('data', (chunk) => {
      if (rejected) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > 20_000) {
        rejected = true;
        chunks = [];
        reject(clientError(413, 'Requisição muito grande.'));
        return;
      }
      chunks.push(bytes);
    });
    request.on('end', () => {
      if (rejected) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
        resolve(value);
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
