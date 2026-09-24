export function retryAfterSeconds(value, now = Date.now()) {
  if (!value) return 0;
  const delay = /^\d+(\.\d+)?$/.test(value) ? Number(value) : (Date.parse(value) - now) / 1000;
  return Number.isFinite(delay) && delay > 0 ? Math.ceil(delay) : 0;
}

// Bounded GET for dashboard/ticket reads. No retries here: the polling cycle owns recovery.
export async function readJson(endpoint, { signal, messages, timeoutMs = 30000 }) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(endpoint, { method: 'GET', credentials: 'include', cache: 'no-store', signal: controller.signal });
    if (!response.ok) {
      throw Object.assign(new Error(messages[response.status] || messages.default), {
        status: response.status, retryAfter: retryAfterSeconds(response.headers.get('Retry-After')),
        reloginRequired: response.status === 401, requestId: response.headers.get('X-Request-Id') || undefined,
      });
    }
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    if (timedOut || error instanceof TypeError && !error.status) {
      throw Object.assign(new Error(timedOut ? 'A consulta demorou demais. A atualização será tentada novamente.'
        : 'A conexão está temporariamente indisponível. A atualização será tentada novamente.'), { retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
