const { getConfig } = require('../config/env');

const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const sensitive = /token|secret|password|authorization|cookie|credential|api[_-]?key|^(headers|body|payload|prompt|content|rawText|state|sessionId)$/i;
const REDACTED = '[REDACTED]';

function sanitize(value, secrets = [], seen = new WeakSet(), depth = 0) {
  if (typeof value === 'string') {
    let text = value;
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
      text = text.split(secret).join(REDACTED);
    }
    return text.replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, '$1 [REDACTED]')
      .replace(/\b(authorization|cookie|set-cookie)\s*[:=][^\r\n]*/gi, '$1=[REDACTED]')
      .replace(/\b(api[_-]?key|[\w-]*token|[\w-]*secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
      .slice(0, 2000);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (!value || typeof value !== 'object') return undefined;
  if (seen.has(value)) return '[Circular]';
  if (depth >= 6) return '[Truncated]';
  seen.add(value);
  // Não serializa headers, requestBody, cause ou outros campos arbitrários do SDK.
  const source = value instanceof Error
    ? { name: value.name, message: value.message, code: value.code, status: value.status, statusCode: value.statusCode }
    : value;
  const result = Array.isArray(source) ? [] : {};
  for (const [key, entry] of Object.entries(source).slice(0, 50)) {
    result[key] = sensitive.test(key) ? REDACTED : sanitize(entry, secrets, seen, depth + 1);
  }
  seen.delete(value);
  return result;
}

function configuredSecrets(config) {
  return [config.discord.token, config.openRouter.apiKey, config.spotify.clientSecret, config.spotify.refreshToken, config.auth.clientSecret];
}

function write(level, line) {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function createLogger({ level = 'info', secrets = [], sink = write } = {}) {
  if (!Object.hasOwn(levels, level)) throw new Error('Nível de log inválido.');
  return Object.fromEntries(Object.keys(levels).map(name => [name, (event, context = {}) => {
    if (levels[name] < levels[level]) return;
    // Falha de serialização/saída de log não pode interromper a operação principal.
    try {
      sink(name, JSON.stringify({
        ...sanitize(context, secrets),
        timestamp: new Date().toISOString(), level: name,
        event: sanitize(event, secrets), service: 'bot',
      }));
    } catch {
      // Não tenta imprimir o objeto original, que pode conter secrets.
    }
  }]));
}

// Configuração lida apenas ao emitir; mantém importação/testes sem efeitos de startup.
const logger = Object.fromEntries(Object.keys(levels).map(level => [level, (event, context) => {
  const config = getConfig();
  createLogger({ level: config.logging.level, secrets: configuredSecrets(config) })[level](event, context);
}]));

function sanitizeError(error) {
  return sanitize(error, configuredSecrets(getConfig()));
}

module.exports = { logger, createLogger, sanitizeError };
