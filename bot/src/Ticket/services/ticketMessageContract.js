const { clientError } = require('../../api/http/errors');

const MESSAGE_ORIGIN = Object.freeze({ DISCORD: 'DISCORD', WEB: 'WEB', AI: 'AI', SYSTEM: 'SYSTEM' });
const MESSAGE_AUTHOR_TYPE = Object.freeze({ USER: 'USER', STAFF: 'STAFF', AI: 'AI', SYSTEM: 'SYSTEM' });
const MESSAGE_VISIBILITY = Object.freeze({ PUBLIC: 'PUBLIC', INTERNAL: 'INTERNAL', SYSTEM: 'SYSTEM' });
const DELIVERY_STATUS = Object.freeze({ PENDING: 'PENDING', SENDING: 'SENDING', SENT: 'SENT', FAILED: 'FAILED', NOT_REQUIRED: 'NOT_REQUIRED' });
const WEB_CONTENT_LIMIT = 1800;
const STORED_CONTENT_LIMIT = 2000;

function content(value, limit = STORED_CONTENT_LIMIT) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000]/.test(value)) {
    throw clientError(400, `A mensagem deve conter entre 1 e ${limit} caracteres.`);
  }
  return value.trim();
}

function clientMessageId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/.test(value)) {
    throw clientError(400, 'clientMessageId inválido.');
  }
  return value;
}

module.exports = { MESSAGE_ORIGIN, MESSAGE_AUTHOR_TYPE, MESSAGE_VISIBILITY, DELIVERY_STATUS,
  WEB_CONTENT_LIMIT, STORED_CONTENT_LIMIT, content, clientMessageId };
