const { clientError, isClientError } = require('../api/http/errors');

const NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET']);
function isTransientConnection(error) {
  return ['TimeoutError', 'AbortError'].includes(error?.name) ||
    NETWORK_CODES.has(error?.code) || NETWORK_CODES.has(error?.cause?.code);
}
function readError(status, code, message, retryAfter) {
  return Object.assign(clientError(status, message), { code, ...(retryAfter ? { retryAfter } : {}) });
}
function retryAfterSeconds(value, now = Date.now()) {
  if (value == null || value === '') return undefined;
  const seconds = /^\d+(\.\d+)?$/.test(value) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

// Only known Discord/transport failures are normalized; programming errors remain 500.
function memberReadError(error) {
  if (isClientError(error)) return error;
  if (error?.code === 10007) return readError(403, 'DISCORD_MEMBER_MISSING', 'O usuário não participa mais deste servidor.');
  if ([10004, 50001, 50013].includes(error?.code) || error?.status === 403 || error?.status === 404) {
    return readError(403, 'DISCORD_ACCESS_DENIED', 'O servidor ou membro não está disponível para consulta.');
  }
  if (error?.status === 429 || error?.name === 'RateLimitError') {
    const delay = Number(error.retryAfter ?? error.timeToReset);
    return readError(429, 'DISCORD_RATE_LIMIT', 'Aguarde antes de consultar o Discord novamente.',
      Number.isFinite(delay) && delay > 0 ? Math.ceil(delay / 1000) : 15);
  }
  if (isTransientConnection(error)) return readError(502, 'DISCORD_CONNECTION_FAILED', 'A consulta ao Discord está temporariamente indisponível.');
  if (Number.isInteger(error?.status) && error.status >= 500 && error.status <= 599) {
    return readError(502, 'DISCORD_UPSTREAM_FAILED', 'A consulta ao Discord está temporariamente indisponível.');
  }
  return error;
}
module.exports = { isTransientConnection, readError, retryAfterSeconds, memberReadError };
