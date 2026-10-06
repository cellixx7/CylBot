import { apiError, readJson } from '../lib/readApi.js';

const ticketMessages = {
  400: 'A mensagem enviada é inválida.',
  401: 'Sua sessão expirou. Entre novamente com Discord.',
  403: 'Você não tem permissão para responder neste ticket.',
  404: 'Ticket não encontrado neste servidor.',
  409: 'Este ticket não aceita novas mensagens.',
  429: 'Muitas solicitações. Aguarde um instante antes de tentar novamente.',
  502: 'O Discord está temporariamente indisponível. Sua mensagem pode ter sido preservada.',
  503: 'O envio de mensagens está temporariamente indisponível.',
  default: 'Não foi possível enviar a mensagem.',
};

async function get(path, params, signal) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value != null),
  );

  return readJson(`/api/tickets${path}?${query}`, {
    signal,
    messages: {
      401: 'Sua sessão expirou. Entre novamente com Discord.',
      TICKET_ACCESS_DENIED: 'Você não possui permissão para acessar os tickets deste servidor.',
      GUILD_MEMBERSHIP_REQUIRED: 'Você não participa mais deste servidor.',
      GUILD_NOT_FOUND: 'Este servidor não está disponível para o CylBot.',
      403: 'Não foi possível validar o acesso à Central de Tickets.',
      404: 'Ticket não encontrado neste servidor.',
      429: 'Muitas consultas. A atualização será retomada em instantes.',
      502: 'O Discord está temporariamente indisponível. A conversa será atualizada novamente em instantes.',
      503: 'A consulta de tickets está indisponível. Tente novamente em instantes.',
      default: 'Não foi possível consultar os tickets. Tente novamente.',
    },
  });
}

export const getTickets = (guildId, before, signal, filters = {}) =>
  get('', { guildId, before, limit: 25, ...filters }, signal);

export const getTicketTools = (guildId, ticketId, signal) => get(`/${ticketId}/tools`, { guildId }, signal);
export async function runTicketTool(guildId, ticketId, action, values) {
  const response = await fetch(`/api/tickets/${ticketId}/tools/${action}`, {
    method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId, ...values }),
  });
  if (!response.ok) throw await apiError(response, { 400: 'Confira os campos e confirme a ação.', 403: 'Ação negada pelas permissões ou hierarquia do Discord.', 409: 'O estado mudou. Atualize as ferramentas.', 429: 'Muitas solicitações. Aguarde alguns instantes antes de tentar novamente.', 502: 'O Discord não confirmou a ação. Atualize as ferramentas antes de tentar novamente.' }[response.status] || ticketMessages[response.status] || 'Não foi possível executar a ferramenta.');
  return response.json();
}

export const getTicket = (guildId, ticketId, signal) =>
  get(`/${ticketId}`, { guildId }, signal);

export const getMessages = (guildId, ticketId, before, signal) =>
  get(`/${ticketId}/messages`, { guildId, before, limit: 50 }, signal);

export const getMessageRevisions = (guildId, ticketId, messageId, signal) =>
  get(`/${ticketId}/messages/${messageId}/revisions`, { guildId }, signal);

export const getTicketAIStatus = (guildId, ticketId, signal) =>
  get(`/${ticketId}/ai/status`, { guildId }, signal);

export const getTicketAIConfig = (guildId, signal) =>
  get(`/ai/config/${guildId}`, {}, signal);

async function ticketAIRequest(path, method, body) {
  const response = await fetch(path, {
    method, credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw await apiError(response, ticketMessages[response.status] || ticketMessages.default);
  return response.json();
}

export const runTicketAISuggestion = (guildId, ticketId) =>
  ticketAIRequest(`/api/tickets/${ticketId}/ai/suggest`, 'POST', { guildId });

export const pauseTicketAI = (guildId, ticketId) =>
  ticketAIRequest(`/api/tickets/${ticketId}/ai/pause`, 'POST', { guildId });

export const resumeTicketAI = (guildId, ticketId) =>
  ticketAIRequest(`/api/tickets/${ticketId}/ai/resume`, 'POST', { guildId });

export const updateTicketAIConfig = (guildId, config) =>
  ticketAIRequest(`/api/tickets/ai/config/${guildId}`, 'PUT', config);

export async function ticketAction(guildId, ticketId, action, values = {}) {
  const response = await fetch(`/api/tickets/${ticketId}/actions/${action}`, {
    method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId, ...values }),
  });
  const actionMessages = { 400: 'Confira os campos da ação.', 403: 'Você não tem permissão para esta ação no ticket.', 409: 'O estado do ticket mudou. Atualize o atendimento.', 503: 'A operação está temporariamente indisponível. Atualize o ticket para verificar o estado e retomar.' };
  if (!response.ok) throw await apiError(response, actionMessages[response.status] || ticketMessages[response.status] || 'Não foi possível concluir a ação.');
  return response.json();
}

export async function postTicketMessage(
  guildId,
  ticketId,
  { clientMessageId, content },
  signal,
) {
  const response = await fetch(`/api/tickets/${ticketId}/messages`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      guildId,
      clientMessageId,
      content,
    }),
    signal,
  });

  if (!response.ok) throw await apiError(response, ticketMessages[response.status] || ticketMessages.default);

  return response.json();
}

export async function retryTicketMessage(
  guildId,
  ticketId,
  messageId,
  signal,
) {
  const response = await fetch(
    `/api/tickets/${ticketId}/messages/${messageId}/retry`,
    {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        guildId,
      }),
      signal,
    },
  );

  if (!response.ok) throw await apiError(response, ticketMessages[response.status] || ticketMessages.default);

  return response.json();
}

export async function editTicketMessage(
  guildId,
  ticketId,
  messageId,
  content,
  signal,
) {
  const response = await fetch(
    `/api/tickets/${ticketId}/messages/${messageId}`,
    {
      method: 'PATCH',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        guildId,
        content,
      }),
      signal,
    },
  );

  if (!response.ok) throw await apiError(response, ticketMessages[response.status] || ticketMessages.default);

  return response.json();
}
