import { logApi } from '../lib/diagnostics.js';

async function request(path, options = {}) {
  const endpoint = `/api/auth/${path}`;
  const startedAt = performance.now();
  try {
    const response = await fetch(endpoint, { ...options, credentials: 'include', cache: 'no-store' });
    const details = { endpoint, method: options.method || 'GET', status: response.status,
      durationMs: Math.round(performance.now() - startedAt), requestId: response.headers.get('X-Request-Id') || undefined };
    if (path === 'me' && (response.status === 204 || response.status === 401)) {
      logApi('auth.session_missing', details, 'warn');
      return null;
    }
    if (!response.ok) {
      logApi('auth.request_failed', details, 'error');
      throw new Error('Não foi possível acessar sua sessão. Tente novamente.');
    }
    logApi('auth.request_ok', details);
    return response.status === 204 ? null : response.json();
  } catch (error) {
    if (error.name !== 'AbortError') logApi('auth.request_error', { endpoint, method: options.method || 'GET', message: error.message }, 'error');
    throw error;
  }
}

export const authApi = {
  me: signal => request('me', { signal }),
  logout: () => request('logout', { method: 'POST' }),
};
