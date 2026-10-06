import { apiError, readJson } from '../lib/readApi.js';

const messages = {
  400: 'Revise os dados da publicação e tente novamente.',
  401: 'Sua sessão expirou. Entre novamente com Discord.',
  403: 'Você não possui permissão para publicar neste servidor.',
  429: 'Muitas solicitações. Aguarde um instante antes de tentar novamente.',
  502: 'A geração está temporariamente indisponível. Tente novamente.',
  503: 'A publicação está temporariamente indisponível. Tente novamente.',
  default: 'Não foi possível concluir a publicação.',
};

export function getAnnouncementWorkspace(guildId, signal) {
  return readJson(`/api/announcements/workspace?${new URLSearchParams({ guildId })}`, { signal, messages });
}

async function post(path, body) {
  const response = await fetch(path, { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw await apiError(response, messages);
  return response.json();
}

export const generateAnnouncement = input => post('/api/announcements/workspace/generate', input);
export const suggestAnnouncement = input => post('/api/announcements/workspace/suggest', input);
export const publishAnnouncement = input => post('/api/announcements/workspace/publish', input);
