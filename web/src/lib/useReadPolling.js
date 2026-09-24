import { useEffect, useState } from 'react';
import { startPolling, emptyReadState as empty, failedReadState } from './readPolling.js';

export function useReadPolling(load, requireRelogin, interval = 15000) {
  const [state, setState] = useState(empty);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setState(previous => previous.load === load
      ? { ...previous, loading: !previous.data, refreshing: true, retryAt: null, stopped: false } : { load, ...empty });
    return startPolling({
      load,
      interval,
      onStart: () => setState(previous => ({ ...previous, refreshing: true })),
      onData: data => setState({ load, data, loading: false, refreshing: false, error: '', updatedAt: Date.now(), retryAt: null, stopped: false }),
      onError: (error, terminal, recovery) => {
        setState(previous => failedReadState(previous, error, terminal, recovery));
        if (error.status === 401) requireRelogin();
      },
    });
  }, [load, requireRelogin, attempt, interval]);
  // A changed cursor must never render the previous page, even before the effect runs.
  return { ...(state.load === load ? state : empty), retry: () => {
    if (!state.refreshing && (!state.retryAt || Date.now() >= state.retryAt)) setAttempt(value => value + 1);
  } };
}
