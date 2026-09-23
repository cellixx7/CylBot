const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const { isClientError } = require('../../api/http/errors');

const operations = new AsyncLocalStorage();
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const names = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'AggregateError',
  'DiscordAPIError', 'HTTPError', 'RateLimitError', 'DrizzleQueryError', 'DatabaseError',
  'TicketDomainError', 'TicketNotFoundError', 'TicketAlreadyClaimedError', 'TicketInvalidStateError',
  'TicketConfigurationError', 'TicketPermissionError', 'TicketLimitError']);
const appCodes = new Set(['TICKET_ACTIVE_LIMIT', 'TICKET_OPEN_COOLDOWN', 'TICKET_REOPEN_COOLDOWN', 'TICKET_CHANNEL_MISMATCH']);

function interactionDetails(customId) {
  let match;
  if ((match = customId?.match(new RegExp(`^ticket:(claim|close|finish):(${UUID})$`)))
    || (match = customId?.match(new RegExp(`^ticket:(remove|delete|reopen):(${UUID}):\\d{1,6}$`)))) {
    return { action: match[1] === 'finish' ? 'close' : match[1], customIdAction: `ticket:${match[1]}`, ticketId: match[2] };
  }
  if ((match = customId?.match(new RegExp(`^ticket:setup:(start|cancel|role|auto|existing|panel|log|category|defaults|custom|confirm):${UUID}$`)))) {
    return { action: `setup.${match[1]}`, customIdAction: `ticket:setup:${match[1]}` };
  }
  if (/^ticket:(create|category)$/.test(customId) || /^ticket:open:[a-z0-9-]{1,40}$/.test(customId)) {
    const action = customId.split(':')[1];
    return { action, customIdAction: `ticket:${action}` };
  }
  return { action: 'invalid', customIdAction: 'ticket:invalid' };
}

function runTicketOperation(interaction, details, operation) {
  return operations.run({ ...details, operationId: randomUUID(), guildId: interaction.guildId,
    userId: interaction.user?.id, interactionChannelId: interaction.channelId, stage: 'interaction' }, operation);
}

function setTicketContext(ticket) {
  const current = operations.getStore();
  if (current) Object.assign(current, { ticketId: ticket.id, channelId: ticket.channelId });
}
function setTicketStage(stage) {
  const current = operations.getStore();
  if (current) current.stage = stage;
}
function ticketLogContext() { return { ...operations.getStore() }; }

// Lista fechada: nunca serializa mensagem, stack, SQL, requestBody, token ou payload do SDK.
function safeName(error) {
  const name = error?.name;
  if (typeof name === 'string' && /^DiscordAPIError(?:\[\d+\])?$/.test(name)) return 'DiscordAPIError';
  if (names.has(name)) return name;
  return names.has(error?.constructor?.name) ? error.constructor.name : 'Error';
}
function safeCode(error) {
  const code = error?.code;
  if (typeof code === 'number' && Number.isSafeInteger(code)) return code;
  if (typeof code === 'string' && (/^[0-9A-Z]{5}$/.test(code) || /^E[A-Z_]{2,30}$/.test(code) || appCodes.has(code))) return code;
  return undefined;
}
function errorDetails(error) {
  const details = { errorName: safeName(error), errorCode: safeCode(error) };
  let current = error;
  const seen = new Set();
  for (let depth = 0; current && depth < 4 && !seen.has(current); depth++, current = current.cause) {
    seen.add(current);
    const name = safeName(current);
    if (current !== error) Object.assign(details, { causeErrorName: name, causeErrorCode: safeCode(current) });
    if (['DiscordAPIError', 'HTTPError', 'RateLimitError'].includes(name)) {
      details.errorSource = 'discord';
      const status = current.status ?? current.statusCode;
      if (Number.isInteger(status) && status >= 400 && status <= 599) details.upstreamStatusCode = status;
      if (status === 429 || name === 'RateLimitError') details.rateLimitSource = 'discord';
    }
  }
  if (!details.rateLimitSource && isClientError(error) && error.statusCode === 429) details.rateLimitSource = 'app';
  return details;
}

module.exports = { interactionDetails, runTicketOperation, setTicketContext, setTicketStage, ticketLogContext, errorDetails };
