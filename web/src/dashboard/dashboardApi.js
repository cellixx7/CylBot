import { logApi } from '../lib/diagnostics.js';

export async function getGuilds(signal) {
  const endpoint = '/api/dashboard/guilds';
  const startedAt = performance.now();
  try {
    const response = await fetch(endpoint, { credentials: 'include', cache: 'no-store', signal });
    const details = { endpoint, method: 'GET', status: response.status,
      durationMs: Math.round(performance.now() - startedAt), requestId: response.headers.get('X-Request-Id') || undefined };
    if (response.status === 401) {
      logApi('dashboard.session_rejected', details, 'warn');
      throw Object.assign(new Error('Entre novamente com Discord.'), { reloginRequired: true });
    }
    if (!response.ok) {
      logApi('dashboard.request_failed', details, 'error');
      throw new Error(response.status === 503
        ? 'O CylBot está conectando. Tente novamente em instantes.'
        : 'Não foi possível carregar seus servidores. Tente novamente.');
    }
    const data = await response.json();
    if (!Array.isArray(data.guilds)) throw new Error('Não foi possível carregar seus servidores. Tente novamente.');
    logApi('dashboard.request_ok', { ...details, guildCount: data.guilds.length });
    return data.guilds;
  } catch (error) {
    if (error.name !== 'AbortError' && !error.reloginRequired) logApi('dashboard.request_error', { endpoint, message: error.message }, 'error');
    throw error;
  }
}
