export async function getGuilds(signal) {
  const response = await fetch('/api/dashboard/guilds', { credentials: 'include', cache: 'no-store', signal });
  if (response.status === 401) throw Object.assign(new Error('Entre novamente com Discord.'), { reloginRequired: true });
  if (!response.ok) throw new Error(response.status === 503
    ? 'O CylBot está conectando. Tente novamente em instantes.'
    : 'Não foi possível carregar seus servidores. Tente novamente.');
  const data = await response.json();
  if (!Array.isArray(data.guilds)) throw new Error('Não foi possível carregar seus servidores. Tente novamente.');
  return data.guilds;
}
