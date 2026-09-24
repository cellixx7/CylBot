import { logApi } from '../lib/diagnostics.js';
import { readJson } from '../lib/readApi.js';

export async function getGuilds(signal) {
  const endpoint = '/api/dashboard/guilds';
  const startedAt = performance.now();
  try {
    const data = await readJson(endpoint, { signal, messages: {
      401: 'Entre novamente com Discord.',
      403: 'Você não tem acesso à lista de servidores.',
      404: 'A lista de servidores não está disponível neste endereço.',
      429: 'Muitas consultas. Aguarde a próxima atualização.',
      502: 'O Discord está temporariamente indisponível. A lista será atualizada novamente em instantes.',
      503: 'O CylBot está conectando. A lista será atualizada novamente em instantes.',
      default: 'Não foi possível carregar seus servidores. Tente novamente.',
    } });
    if (!Array.isArray(data.guilds)) throw new Error('Não foi possível carregar seus servidores. Tente novamente.');
    logApi('dashboard.request_ok', { endpoint, method: 'GET', status: 200,
      durationMs: Math.round(performance.now() - startedAt), guildCount: data.guilds.length });
    return data.guilds;
  } catch (error) {
    if (!signal?.aborted) logApi('dashboard.request_failed', { endpoint, method: 'GET', status: error.status,
      requestId: error.requestId, durationMs: Math.round(performance.now() - startedAt) }, 'warn');
    throw error;
  }
}
