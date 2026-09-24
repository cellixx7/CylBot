// A single request cycle at a time. Hidden tabs release both requests and timers.
export function startPolling({ load, onData, onError, onStart = () => {}, visibility = document, interval = 15000 }) {
  let disposed = false;
  let stopped = false;
  let failures = 0;
  let timer;
  let controller;
  let retryAt = 0;

  async function run() {
    if (disposed || stopped || visibility.hidden || controller) return;
    if (Date.now() < retryAt) {
      timer = setTimeout(run, Math.min(retryAt - Date.now(), 2147483647));
      return;
    }
    const current = new AbortController();
    controller = current;
    let delay = interval;
    try {
      onStart();
      const data = await load(current.signal);
      if (!disposed && !current.signal.aborted) { failures = 0; retryAt = 0; onData(data); }
    } catch (error) {
      if (!disposed && !current.signal.aborted) {
        const terminal = [401, 403, 404].includes(error.status);
        stopped = terminal || !([429, 502, 503, 504].includes(error.status) || error.retryable === true);
        failures++;
        delay = Math.max(interval, Math.min(interval * 2 ** Math.min(failures - 1, 3), 60000), (error.retryAfter || 0) * 1000);
        retryAt = Date.now() + delay;
        onError(error, terminal, { retryAt: stopped ? null : retryAt, stopped });
        // Cancel any sibling request in a failed detail/message cycle.
        current.abort();
      }
    } finally {
      if (controller === current) {
        controller = null;
        if (!disposed && !stopped && !visibility.hidden) timer = setTimeout(run, Math.min(delay, 2147483647));
      }
    }
  }
  function onVisibility() {
    clearTimeout(timer);
    if (visibility.hidden) {
      controller?.abort();
      controller = null;
    } else run();
  }
  visibility.addEventListener('visibilitychange', onVisibility);
  run();
  return () => {
    disposed = true;
    clearTimeout(timer);
    controller?.abort();
    visibility.removeEventListener('visibilitychange', onVisibility);
  };
}

export const emptyReadState = { data: null, loading: true, refreshing: true, error: '', updatedAt: null, retryAt: null, stopped: false };
export function failedReadState(previous, error, terminal, recovery) {
  return { ...previous, ...recovery, data: terminal ? null : previous.data,
    updatedAt: terminal ? null : previous.updatedAt, loading: false, refreshing: false, error: error.message };
}
