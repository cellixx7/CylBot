import { apiError, readJson } from '../lib/readApi.js';
const messages = { PROFILE_PRIVATE: 'Este perfil é privado.', PROFILE_COMMUNITY_REQUIRED: 'Escolha uma comunidade compartilhada para ver este perfil.',
  PROFILE_PLUS_REQUIRED: 'Os temas Aurora e Cósmico fazem parte do CYL Plus.',
  401: 'Entre novamente com Discord.', 403: 'Este perfil não está disponível para sua conta.', default: 'Não foi possível consultar o perfil.' };
export const getProfile = (userId = 'me', guildId = '', signal) => readJson(`/api/profile/${userId}${guildId ? `?${new URLSearchParams({ guildId })}` : ''}`, { signal, messages });
export const getCommunities = signal => readJson('/api/profile/communities', { signal, messages });
export async function saveProfile(profile) {
  const response = await fetch('/api/profile/me', { method: 'PATCH', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
  if (!response.ok) throw await apiError(response, { ...messages, 400: 'Revise a bio, a cor e os links do perfil.', default: 'Não foi possível salvar o perfil.' });
  return response.json();
}
