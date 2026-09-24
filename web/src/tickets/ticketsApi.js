import { readJson } from '../lib/readApi.js';

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
      403: 'Você não tem acesso a estes tickets ou deixou de participar do servidor.',
      404: 'Ticket não encontrado neste servidor.',
      429: 'Muitas consultas. A atualização será retomada em instantes.',
      502: 'O Discord está temporariamente indisponível. A conversa será atualizada novamente em instantes.',
      503: 'A consulta de tickets está indisponível. Tente novamente em instantes.',
      default: 'Não foi possível consultar os tickets. Tente novamente.',
    },
  });
}

export const getTickets = (guildId, before, signal) =>
  get('', { guildId, before, limit: 25 }, signal);

export const getTicket = (guildId, ticketId, signal) =>
  get(`/${ticketId}`, { guildId }, signal);

export const getMessages = (guildId, ticketId, before, signal) =>
  get(`/${ticketId}/messages`, { guildId, before, limit: 50 }, signal);

export const getMessageRevisions = (guildId, ticketId, messageId, signal) =>
  get(`/${ticketId}/messages/${messageId}/revisions`, { guildId }, signal);

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

  if (!response.ok) {
    throw Object.assign(
      new Error(ticketMessages[response.status] || ticketMessages.default),
      {
        status: response.status,
        reloginRequired: response.status === 401,
        requestId: response.headers.get('X-Request-Id') || undefined,
      },
    );
  }

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

  if (!response.ok) {
    throw Object.assign(
      new Error(
        ticketMessages[response.status] ||
        ticketMessages.default,
      ),
      {
        status: response.status,
        reloginRequired:
          response.status === 401,
        requestId:
          response.headers.get(
            'X-Request-Id',
          ) || undefined,
      },
    );
  }

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

  if (!response.ok) {
    throw Object.assign(
      new Error(
        ticketMessages[response.status] ||
        ticketMessages.default,
      ),
      {
        status: response.status,
        reloginRequired:
          response.status === 401,
        requestId:
          response.headers.get(
            'X-Request-Id',
          ) || undefined,
      },
    );
  }

  return response.json();
}
