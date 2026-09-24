import { useCallback, useEffect, useRef, useState } from 'react';
import {
  editTicketMessage,
  getMessages,
  getMessageRevisions,
  getTicket,
  getTickets,
  retryTicketMessage,
} from './ticketsApi.js';
import {
  isLocalMessageConfirmed,
  mergeTicketMessages,
  ticketConversationMode,
} from './messageReconciliation.js';
import { useTicketComposer } from './useTicketComposer.js';
import { useTicketPolling } from './useTicketPolling.js';
import './tickets.css';

const statuses = {
  OPEN: 'Aberto',
  CLAIMED: 'Em atendimento',
  CLOSED: 'Fechado',
  REOPENED: 'Reaberto',
};

const authors = {
  USER: 'Usuário',
  STAFF: 'Equipe',
  AI: 'IA',
  SYSTEM: 'Sistema',
};

const origins = {
  DISCORD: 'Discord',
  WEB: 'Web',
  AI: 'IA',
  SYSTEM: 'Sistema',
};

const deliveries = {
  PENDING: 'Entrega pendente',
  SENDING: 'Em entrega',
  SENT: 'Entregue ao Discord',
  FAILED: 'Falha na entrega ao Discord',
  NOT_REQUIRED: 'Sem entrega necessária',
};

const date = value =>
  value == null
    ? '—'
    : new Date(value).toLocaleString('pt-BR');

const shortTime = value =>
  value == null ? '—' : new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  });

const href = (guildId, ticketId) =>
  `#/dashboard/${guildId}/tickets${ticketId ? `/${ticketId}` : ''}`;

function Status({ value }) {
  return (
    <span className={`ticket-status ticket-status-${value.toLowerCase()}`}>
      {statuses[value] || value}
    </span>
  );
}

function PollStatus({ state }) {
  return (
    <div className="ticket-poll-status">
      {state.loading && (
        <p role="status">
          Carregando tickets...
        </p>
      )}

      {state.error && (
        <div role="alert">
          <p>{state.error}</p>

          <button
            className="button button-outline"
            disabled={
              state.refreshing ||
              state.retryAt > Date.now()
            }
            onClick={state.retry}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {state.retryAt && (
        <p>
          Próxima tentativa a partir de {date(state.retryAt)}, com a aba visível.
        </p>
      )}

      {state.updatedAt && (
        <p>
          {state.error
            ? 'Dados da última consulta: '
            : 'Atualizado em '}
          {date(state.updatedAt)}.

          {!state.error &&
            ' Atualização automática a cada 15 segundos com a aba visível.'}
        </p>
      )}
    </div>
  );
}

function Pagination({
  cursors,
  setCursors,
  nextBefore,
  history = false,
}) {
  return (
    <nav
      className="ticket-pagination"
      aria-label={
        history
          ? 'Páginas de mensagens'
          : 'Páginas de tickets'
      }
    >
      {cursors.length > 1 && (
        <>
          <button
            className="button button-outline"
            onClick={() => setCursors([null])}
          >
            Voltar {history ? 'às últimas mensagens' : 'ao início'}
          </button>

          {cursors.length > 2 && (
            <button
              className="button button-outline"
              onClick={() =>
                setCursors(cursors.slice(0, -1))
              }
            >
              Página mais recente
            </button>
          )}
        </>
      )}

      <span>
        {cursors.length === 1
          ? history
            ? 'Mensagens mais recentes'
            : 'Tickets mais recentes'
          : `Página ${cursors.length}`}
      </span>

      {nextBefore != null && (
        <button
          className="button button-outline"
          onClick={() =>
            setCursors([
              ...cursors,
              nextBefore,
            ])
          }
        >
          {history
            ? 'Mensagens anteriores'
            : 'Tickets anteriores'}{' '}
          →
        </button>
      )}
    </nav>
  );
}

function TicketList({
  guildId,
  requireRelogin,
}) {
  const [cursors, setCursors] = useState([null]);

  const before = cursors.at(-1);

  const load = useCallback(
    signal =>
      getTickets(
        guildId,
        before,
        signal,
      ),
    [guildId, before],
  );

  const state = useTicketPolling(
    load,
    requireRelogin,
  );

  return (
    <>
      <PollStatus state={state} />

      {state.data && (
        <>
          <Pagination
            cursors={cursors}
            setCursors={setCursors}
            nextBefore={
              state.data.nextBefore
            }
          />

          {state.data.tickets.length ? (
            <ul
              className="ticket-list"
              aria-label="Tickets acessíveis"
            >
              {state.data.tickets.map(ticket => (
                <li key={ticket.id}>
                  <a
                    className="ticket-card"
                    href={href(
                      guildId,
                      ticket.id,
                    )}
                  >
                    <div className="ticket-card-heading">
                      <span>
                        #{ticket.publicNumber}
                      </span>

                      <Status
                        value={ticket.status}
                      />
                    </div>

                    <h2>
                      {ticket.subject}
                    </h2>

                    <p>
                      {ticket.categoryName ||
                        'Sem categoria'}{' '}
                      ·{' '}
                      {ticket.creatorName ||
                        'Usuário'}
                    </p>

                    <p>
                      Responsável:{' '}
                      {ticket.assignedName ||
                        'Não atribuído'}
                    </p>

                    <small>
                      Aberto em{' '}
                      {date(
                        ticket.createdAt,
                      )}
                    </small>

                    <span className="ticket-open">
                      Ver conversa →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p
              className="dashboard-notice"
              role="status"
            >
              Nenhum ticket disponível para você nesta página.
            </p>
          )}
        </>
      )}
    </>
  );
}

function TicketDetail({
  guildId,
  ticketId,
  requireRelogin,
}) {
  const [cursors, setCursors] = useState([null]);
  const [localMessages, setLocalMessages] = useState([]);
  const [retryingMessageId, setRetryingMessageId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingError, setEditingError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [revisions, setRevisions] = useState({});

  const messageAttemptRef = useRef(null);

  const composer = useTicketComposer({
    guildId,
    ticketId,
    requireRelogin,
  });

  const before = cursors.at(-1);

  const load = useCallback(
    async signal => {
      const [detail, page] =
        await Promise.all([
          getTicket(
            guildId,
            ticketId,
            signal,
          ),
          getMessages(
            guildId,
            ticketId,
            before,
            signal,
          ),
        ]);

      return {
        ...detail,
        ...page,
      };
    },
    [
      guildId,
      ticketId,
      before,
    ],
  );

  const state = useTicketPolling(
    load,
    requireRelogin,
  );

  const ticket = state.data?.ticket;

  useEffect(() => {
    setLocalMessages([]);
    setRetryingMessageId(null);
    setEditingMessageId(null);
    setEditingContent('');
    setEditingError('');
    setSavingEdit(false);
    setRevisions({});
    messageAttemptRef.current = null;
  }, [guildId, ticketId]);

  const upsertLocalMessage = useCallback(
    message => {
      setLocalMessages(previous => {
        const index = previous.findIndex(
          current =>
            current.id === message.id,
        );

        if (index === -1) {
          return [
            ...previous,
            message,
          ];
        }

        return previous.map(current =>
          current.id === message.id
            ? message
            : current,
        );
      });
    },
    [],
  );

  useEffect(() => {
    const serverMessages =
      state.data?.messages;

    if (!serverMessages?.length) {
      return;
    }

    setLocalMessages(previous => {
      const remaining =
        previous.filter(
          localMessage =>
            !isLocalMessageConfirmed(
              localMessage,
              serverMessages,
            ),
        );

      if (
        remaining.length ===
        previous.length
      ) {
        return previous;
      }

      return remaining;
    });
  }, [state.data?.messages]);

  const displayedMessages = before
    ? state.data?.messages ?? []
    : mergeTicketMessages(
        state.data?.messages ?? [],
        localMessages,
      );

  const canRespond = [
    'OPEN',
    'CLAIMED',
    'REOPENED',
  ].includes(ticket?.status);
  const closed = ticketConversationMode(ticket?.status) === 'history';

  async function handleSubmit(event) {
    event.preventDefault();

    if (
      composer.sending ||
      !canRespond
    ) {
      return;
    }

    const currentDraft =
      composer.draft.trim();

    if (!currentDraft) {
      return;
    }

    if (!messageAttemptRef.current) {
      messageAttemptRef.current = {
        clientMessageId:
          crypto.randomUUID(),
        content: currentDraft,
      };
    }

    const attempt =
      messageAttemptRef.current;

    try {
      const message =
        await composer.send(
          attempt,
        );

      if (!message) {
        return;
      }

      upsertLocalMessage({ ...message, isOwn: true });

      if (before) {
        setCursors([null]);
      }

      const delivered = [
        'SENT',
        'NOT_REQUIRED',
      ].includes(
        message.deliveryStatus,
      );

      if (!delivered) {
        return;
      }

      composer.setDraft('');
      composer.clearAttempt();

      messageAttemptRef.current =
        null;
    } catch {
      // Mantém o mesmo clientMessageId
      // e o mesmo conteúdo para retry.
    }
  }

  async function handleRetryMessage(message) {
  if (
    retryingMessageId ||
    message.deliveryStatus !== 'FAILED'
  ) {
    return;
  }

  setRetryingMessageId(message.id);

  try {
    const result = await retryTicketMessage(
      guildId,
      ticketId,
      message.id,
    );

    const retriedMessage = result.message;

    upsertLocalMessage(retriedMessage);
  } catch (error) {
    if (error.reloginRequired) {
      requireRelogin();
    }

    console.error(
      'Não foi possível reenviar a mensagem.',
      error,
    );
  } finally {
    setRetryingMessageId(null);
  }
}

function startEditing(message) {
  setEditingMessageId(message.id);
  setEditingContent(message.content);
  setEditingError('');
}

function cancelEditing() {
  setEditingMessageId(null);
  setEditingContent('');
  setEditingError('');
}

async function saveEditing(message) {
  const content =
    editingContent.trim();

  if (
    !content ||
    savingEdit
  ) {
    return;
  }

  setSavingEdit(true);
  setEditingError('');

  try {
    const result =
      await editTicketMessage(
        guildId,
        ticketId,
        message.id,
        content,
      );

    upsertLocalMessage({ ...result.message, isOwn: true });

    cancelEditing();
  } catch (error) {
    if (error.reloginRequired) {
      requireRelogin();
    }

    setEditingError(
      error.message ||
      'Não foi possível editar a mensagem.',
    );
  } finally {
    setSavingEdit(false);
  }
}

async function toggleRevisions(message) {
  const current = revisions[message.id];
  if (current?.loading) return;
  if (current?.items) {
    setRevisions(previous => ({ ...previous, [message.id]: { ...current, visible: !current.visible } }));
    return;
  }
  setRevisions(previous => ({ ...previous, [message.id]: { loading: true, visible: true } }));
  try {
    const result = await getMessageRevisions(guildId, ticketId, message.id);
    setRevisions(previous => ({ ...previous, [message.id]: { items: result.revisions, visible: true } }));
  } catch (error) {
    if (error.reloginRequired) requireRelogin();
    setRevisions(previous => ({ ...previous, [message.id]: {
      error: error.message || 'Não foi possível carregar o histórico de edição.',
    } }));
  }
}

  return (
    <>
      <PollStatus state={state} />

      {ticket && (
        <>
          <section
            className="ticket-detail"
            aria-label="Informações do ticket"
          >
            <div className="ticket-card-heading">
              <span>
                Ticket #
                {ticket.publicNumber}
              </span>

              <Status
                value={ticket.status}
              />
            </div>

            <h2>
              {ticket.subject}
            </h2>

            <p className="ticket-content">
              {ticket.description}
            </p>

            <dl className="ticket-metadata">
              <div>
                <dt>Servidor</dt>
                <dd>
                  {ticket.guildName ||
                    guildId}
                </dd>
              </div>

              <div>
                <dt>Categoria</dt>
                <dd>
                  {ticket.categoryName ||
                    'Sem categoria'}
                </dd>
              </div>

              <div>
                <dt>Criador</dt>
                <dd>
                  {ticket.creatorName ||
                    'Usuário'}
                </dd>
              </div>

              <div>
                <dt>Responsável</dt>
                <dd>
                  {ticket.assignedName ||
                    'Não atribuído'}
                </dd>
              </div>

              <div>
                <dt>Aberto em</dt>
                <dd>
                  {date(
                    ticket.createdAt,
                  )}
                </dd>
              </div>

              {ticket.claimedAt && (
                <div>
                  <dt>
                    Assumido em
                  </dt>

                  <dd>
                    {date(
                      ticket.claimedAt,
                    )}
                  </dd>
                </div>
              )}

              {ticket.closedAt && (
                <div>
                  <dt>
                    Último encerramento
                  </dt>

                  <dd>
                    {date(
                      ticket.closedAt,
                    )}
                  </dd>
                </div>
              )}

              {ticket.reopenedAt && (
                <div>
                  <dt>
                    Reaberto em
                  </dt>

                  <dd>
                    {date(
                      ticket.reopenedAt,
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section
            className={closed ? 'ticket-history' : 'ticket-chat'}
            aria-labelledby="ticket-history-title"
          >
            <h2 id="ticket-history-title">
              {closed ? 'Histórico da conversa' : 'Conversa'}
            </h2>

            <p className="description">
              {before
                ? 'Você está consultando uma página anterior do histórico.'
                : closed
                  ? 'Registro consolidado das mensagens deste ticket.'
                  : 'As mensagens mais recentes aparecem ao final desta página.'}
            </p>

            <Pagination
              cursors={cursors}
              setCursors={setCursors}
              nextBefore={
                state.data.nextBefore
              }
              history
            />

            {displayedMessages.length ? (
              <ol
                className={closed ? 'ticket-messages' : 'ticket-chat-messages'}
                aria-label="Mensagens em ordem cronológica"
              >
                {displayedMessages.map(
                  message => (
                    <li
                      className={`${closed ? 'ticket-message' : 'ticket-chat-message'} ticket-message-${message.authorType.toLowerCase()} ${!closed && message.isOwn && !['AI', 'SYSTEM'].includes(message.authorType) ? 'ticket-chat-own' : ''}`}
                      key={message.id}
                    >
                      <header>
                        <strong>
                          {!closed && message.isOwn
                            ? 'Você'
                            : message.authorName ||
                            authors[
                              message
                                .authorType
                            ]}
                        </strong>

                        <span>
                          {
                            authors[
                              message
                                .authorType
                            ]
                          }{' '}
                          ·{' '}
                          {
                            origins[
                              message.origin
                            ]
                          }
                        </span>

                        <time
                          dateTime={new Date(
                            message.createdAt,
                          ).toISOString()}
                        >
                          {closed ? date(message.createdAt) : shortTime(message.createdAt)}
                        </time>

                        {!closed && message.origin === 'WEB' &&
                          message.isOwn &&
                          message.authorType !== 'AI' &&
                          message.authorType !== 'SYSTEM' &&
                          editingMessageId !== message.id && (
                            <button
                              type="button"
                              className="ticket-message-action"
                              aria-label="Editar mensagem"
                              title="Editar mensagem"
                              disabled={
                                savingEdit ||
                                editingMessageId !== null
                              }
                              onClick={() =>
                                startEditing(message)
                              }
                            >
                              ✎
                            </button>
                          )}
                      </header>

                      {message.visibility !==
                        'PUBLIC' && (
                        <p className="ticket-visibility">
                          {message.visibility ===
                          'INTERNAL'
                            ? 'Interna · visível à equipe'
                            : 'Sistema · visível à equipe'}
                        </p>
                      )}

                      {editingMessageId === message.id ? (
                        <div className="ticket-message-edit">
                          <textarea
                            value={editingContent}
                            maxLength={1800}
                            disabled={savingEdit}
                            onChange={event =>
                              setEditingContent(
                                event.target.value,
                              )
                            }
                          />

                          {editingError && (
                            <p
                              className="dashboard-notice"
                              role="alert"
                            >
                              {editingError}
                            </p>
                          )}

                          <div className="ticket-message-edit-actions">
                            <button
                              type="button"
                              className="button button-outline"
                              disabled={savingEdit}
                              onClick={cancelEditing}
                            >
                              Cancelar
                            </button>

                            <button
                              type="button"
                              className="button"
                              disabled={
                                savingEdit ||
                                !editingContent.trim()
                              }
                              onClick={() =>
                                saveEditing(message)
                              }
                            >
                              {savingEdit
                                ? 'Salvando...'
                                : 'Salvar edição'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="ticket-content">
                          {message.content}
                        </p>
                      )}

                      {message.editedAt && (
                        <p className="ticket-edited">
                          {closed ? 'Mensagem editada.' : 'Editado'}
                        </p>
                      )}

                      {closed && message.editedAt && (
                        <div className="ticket-revisions">
                          <button
                            type="button"
                            className="button button-outline"
                            onClick={() => toggleRevisions(message)}
                          >
                            {revisions[message.id]?.visible ? 'Ocultar histórico de edição' : 'Ver histórico de edição'}
                          </button>
                          {revisions[message.id]?.loading && <p role="status">Carregando histórico de edição...</p>}
                          {revisions[message.id]?.error && <p className="dashboard-notice" role="alert">{revisions[message.id].error}</p>}
                          {revisions[message.id]?.visible && revisions[message.id]?.items && (
                            <div className="ticket-revision-list">
                              <strong>Histórico de edição</strong>
                              {revisions[message.id].items.length ? (
                                <ol>
                                  {revisions[message.id].items.map(revision => (
                                    <li key={revision.id}>
                                      <time dateTime={new Date(revision.createdAt).toISOString()}>{date(revision.createdAt)}</time>
                                      <p className="ticket-content">{revision.previousContent}</p>
                                    </li>
                                  ))}
                                </ol>
                              ) : <p>Nenhuma versão anterior disponível.</p>}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ),
                )}
              </ol>
            ) : (
              <p
                className="dashboard-notice"
                role="status"
              >
                Ainda não há mensagens disponíveis nesta conversa. Tickets antigos podem ter histórico ainda não sincronizado.
              </p>
            )}

            {!closed && canRespond ? (
              <form
                className="ticket-composer"
                onSubmit={handleSubmit}
              >
                <label htmlFor="ticket-message">
                  Responder
                </label>

                <textarea
                  id="ticket-message"
                  value={
                    composer.draft
                  }
                  onChange={event =>
                    composer.setDraft(
                      event.target.value,
                    )
                  }
                  placeholder="Escreva sua mensagem..."
                  maxLength={1800}
                  rows={4}
                  disabled={
                    composer.sending ||
                    composer.retryPending
                  }
                />

                <div className="ticket-composer-footer">
                  <span>
                    {
                      composer.draft
                        .length
                    }
                    /1800
                  </span>

                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={
                      !composer.draft.trim() ||
                      composer.sending
                    }
                  >
                    {composer.sending
                      ? 'Enviando...'
                      : composer.retryPending
                        ? 'Tentar novamente'
                        : 'Enviar'}
                  </button>
                </div>

                {composer.error && (
                  <p
                    className="ticket-composer-error"
                    role="alert"
                  >
                    {composer.error}
                  </p>
                )}
              </form>
            ) : (
              <p
                className="dashboard-notice"
                role="status"
              >
                Este ticket não aceita novas mensagens.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}

export default function TicketsPage({
  guildId,
  ticketId,
  requireRelogin,
}) {
  return (
    <main className="dashboard-page tickets-page">
      <a
        className="text-link"
        href={
          ticketId
            ? href(guildId)
            : '#/dashboard'
        }
      >
        ←{' '}
        {ticketId
          ? 'Lista de tickets'
          : 'Todos os servidores'}
      </a>

      <header className="tickets-intro">
        <p className="eyebrow">
          ATENDIMENTO
        </p>

        <h1>
          {ticketId
            ? 'Conversa do ticket'
            : 'Seus tickets'}
        </h1>

        <p className="description">
          {ticketId
            ? 'Consulte o histórico e responda diretamente pelo painel.'
            : 'Tickets deste servidor aos quais você tem acesso, incluindo os encerrados.'}
        </p>
      </header>

      {ticketId ? (
        <TicketDetail
          guildId={guildId}
          ticketId={ticketId}
          requireRelogin={
            requireRelogin
          }
        />
      ) : (
        <TicketList
          guildId={guildId}
          requireRelogin={
            requireRelogin
          }
        />
      )}
    </main>
  );
}
