async function request(path, options = {}) {
  const response = await fetch(`/api/auth/${path}`, { ...options, credentials: 'include', cache: 'no-store' });
  if (path === 'me' && response.status === 401) return null;
  if (!response.ok) throw new Error('Não foi possível acessar sua sessão. Tente novamente.');
  return response.status === 204 ? null : response.json();
}

export const authApi = {
  me: signal => request('me', { signal }),
  logout: () => request('logout', { method: 'POST' }),
};
