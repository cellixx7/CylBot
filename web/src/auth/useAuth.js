import { useCallback, useEffect, useState } from 'react';
import { authApi } from './authApi';

export function useAuth() {
  const [auth, setAuth] = useState({ status: 'loading', user: null });
  const [attempt, setAttempt] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const [reloginRequired, setReloginRequired] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setAuth({ status: 'loading', user: null });
    authApi.me(controller.signal).then(data => {
      if (!controller.signal.aborted) setAuth({ status: data ? 'authenticated' : 'unauthenticated', user: data?.user || null });
    }).catch(() => {
      if (!controller.signal.aborted) setAuth({ status: 'error', user: null });
    });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const requireRelogin = useCallback(() => {
    setReloginRequired(true);
    setAuth({ status: 'unauthenticated', user: null });
  }, []);
  async function logout() {
    setLoggingOut(true);
    setError('');
    try {
      await authApi.logout();
      setReloginRequired(false);
      setAuth({ status: 'unauthenticated', user: null });
      window.location.hash = '#/login';
    } catch {
      setError('Não foi possível sair. Tente novamente.');
    } finally {
      setLoggingOut(false);
    }
  }
  return { ...auth, retry, logout, loggingOut, error, requireRelogin, reloginRequired };
}
