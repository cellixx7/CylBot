import { useCallback, useEffect, useRef, useState } from 'react';
import {
  editTicketMessage,
  getMessages,
  getMessageRevisions,
  getTicket,
  getTicketAIConfig,
  getTicketAIStatus,
  getTickets,
  pauseTicketAI,
  retryTicketMessage,
  resumeTicketAI,
  runTicketAISuggestion,
  ticketAction,
  updateTicketAIConfig,
} from './ticketsApi.js';
import TicketAIControls from './TicketAIControls.jsx';
import TicketAISettings from './TicketAISettings.jsx';
import MessageAvatar from './MessageAvatar.jsx';
import MessageContent from './MessageContent.jsx';
import {
  isLocalMessageConfirmed,
  mergeTicketMessages,
  ticketConversationMode,
} from './messageReconciliation.js';
import { useTicketComposer } from './useTicketComposer.js';
import { useTicketPolling } from './useTicketPolling.js';
import { insertMention, mentionQuery, shouldSubmitOnEnter } from './messagePresentation.js';
import { isGroupedWithPrevious } from './conversationPresentation.js';
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
  if (!state.loading && !state.error) return null;
  return <div className="ticket-poll-status">
    {state.loading && <p role="status">Carregando tickets...</p>}
    {state.error && <div role="alert"><p>{state.error}</p><button className="button button-outline" disabled={state.refreshing || state.retryAt > Date.now()} onClick={state.retry}>Tentar novamente</button></div>}
  </div>;
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
  const [ticketOverride, setTicketOverride] = useState(null);
  const [actionState, setActionState] = useState({ name: '', error: '' });
  const [closeForm, setCloseForm] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeSummary, setCloseSummary] = useState('');
  const [aiOverride, setAiOverride] = useState(null);
  const [aiState, setAiState] = useState({ busy: '', error: '', result: null });
  const [aiConfig, setAiConfig] = useState(null);
  const [aiConfigOpen, setAiConfigOpen] = useState(false);
  const [aiConfigState, setAiConfigState] = useState({ saving: false, error: '' });

  const messageAttemptRef = useRef(null);
  const conversationEndRef = useRef(null);
  const stayNearConversationEndRef = useRef(true);

  const composer = useTicketComposer({
    guildId,
    ticketId,
    requireRelogin,
  });

  const before = cursors.at(-1);

  const load = useCallback(
    async signal => {
      const [detail, page, aiStatus] =
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
          getTicketAIStatus(guildId, ticketId, signal).catch(error => {
            if ([403, 404].includes(error.status)) return null;
            throw error;
          }),
        ]);

      return {
        ...detail,
        ...page,
        aiStatus: aiStatus?.status || null,
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

  const ticket = ticketOverride || state.data?.ticket;

  useEffect(() => {
    setLocalMessages([]);
    setRetryingMessageId(null);
    setEditingMessageId(null);
    setEditingContent('');
    setEditingError('');
    setSavingEdit(false);
    setRevisions({});
    setTicketOverride(null);
    setActionState({ name: '', error: '' });
    setCloseForm(false);
    setAiOverride(null);
    setAiState({ busy: '', error: '', result: null });
    setAiConfig(null);
    setAiConfigOpen(false);
    setAiConfigState({ saving: false, error: '' });
    messageAttemptRef.current = null;
  }, [guildId, ticketId]);

  useEffect(() => {
    const serverTicket = state.data?.ticket;
    if (!ticketOverride || !serverTicket) return;
    if (
      serverTicket.status === ticketOverride.status &&
      serverTicket.assignedName === ticketOverride.assignedName &&
      serverTicket.closedAt === ticketOverride.closedAt &&
      serverTicket.reopenedAt === ticketOverride.reopenedAt
    ) setTicketOverride(null);
  }, [state.data?.ticket, ticketOverride]);

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

  const displayedMessages = (before
    ? state.data?.messages ?? []
    : mergeTicketMessages(
        state.data?.messages ?? [],
        localMessages,
      )).filter(message => message.authorType !== 'SYSTEM' && message.origin !== 'SYSTEM' && message.visibility !== 'SYSTEM');

  const canRespond = ticket?.actions?.canRespond === true;
  const closed = ticketConversationMode(ticket?.status) === 'history';
  const aiStatus = aiOverride || state.data?.aiStatus;
  const activeMentionQuery = mentionQuery(composer.draft);
  const mentionOptions = activeMentionQuery === null ? [] : (state.data?.participants ?? [])
    .filter(person => person.name.toLocaleLowerCase('pt-BR').includes(activeMentionQuery.toLocaleLowerCase('pt-BR')))
    .slice(0, 5);

  useEffect(() => {
    const updatePosition = () => {
      stayNearConversationEndRef.current = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight) < 180;
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, { passive: true });
    return () => window.removeEventListener('scroll', updatePosition);
  }, []);

  useEffect(() => {
    if (!before && !closed && stayNearConversationEndRef.current) conversationEndRef.current?.scrollIntoView({ block: 'end' });
  }, [before, closed, displayedMessages.length]);

  useEffect(() => {
    const serverStatus = state.data?.aiStatus;
    if (!aiOverride || !serverStatus) return;
    if (serverStatus.paused === aiOverride.paused && serverStatus.escalatedAt === aiOverride.escalatedAt) setAiOverride(null);
  }, [state.data?.aiStatus, aiOverride]);

  async function runAI(action) {
    if (aiState.busy) return;
    setAiState({ busy: action, error: '', result: action === 'suggest' ? aiState.result : null });
    try {
      const result = action === 'suggest' ? await runTicketAISuggestion(guildId, ticketId)
        : action === 'pause' ? await pauseTicketAI(guildId, ticketId) : await resumeTicketAI(guildId, ticketId);
      if (action !== 'suggest') setAiOverride(previous => {
        const current = previous || state.data?.aiStatus;
        return { ...current, paused: result.paused,
          escalated: action === 'resume' ? false : current?.escalated, escalatedAt: action === 'resume' ? null : current?.escalatedAt,
          canGenerateSuggestion: action === 'resume' ? Boolean(current?.enabled && current?.available) : false,
          canPause: action === 'resume', canResume: action === 'pause' };
      });
      setAiState({ busy: '', error: '', result: action === 'suggest' ? result : aiState.result });
    } catch (error) {
      if (error.reloginRequired) requireRelogin();
      setAiState({ busy: '', error: error.message || 'Não foi possível concluir a ação da IA.', result: aiState.result });
    }
  }

  async function openAIConfig() {
    if (aiState.busy) return;
    if (aiConfig) {
      setAiConfigOpen(true);
      return;
    }
    setAiState(previous => ({ ...previous, busy: 'config', error: '' }));
    try {
      const result = await getTicketAIConfig(guildId);
      setAiConfig(result.config);
      setAiConfigOpen(true);
      setAiState(previous => ({ ...previous, busy: '', error: '' }));
    } catch (error) {
      if (error.reloginRequired) requireRelogin();
      setAiState(previous => ({ ...previous, busy: '', error: error.message || 'Não foi possível carregar a configuração.' }));
    }
  }

  async function saveAIConfig() {
    if (!aiConfig || aiConfigState.saving) return;
    setAiConfigState({ saving: true, error: '' });
    try {
      const result = await updateTicketAIConfig(guildId, aiConfig);
      setAiConfig(result.config); setAiConfigState({ saving: false, error: '' });
      setAiConfigOpen(false);
      setAiOverride(previous => previous ? { ...previous, enabled: result.config.enabled, autonomyLevel: result.config.autonomyLevel, assistantName: result.config.assistantName } : previous);
    } catch (error) {
      if (error.reloginRequired) requireRelogin();
      setAiConfigState({ saving: false, error: error.message || 'Não foi possível salvar a configuração.' });
    }
  }

  async function runAction(action, values) {
    if (actionState.name) return;
    setActionState({ name: action, error: '' });
    try {
      const result = await ticketAction(guildId, ticketId, action, values);
      setTicketOverride(result.ticket);
      if (action === 'close') setCloseForm(false);
      setActionState({ name: '', error: '' });
    } catch (error) {
      if (error.reloginRequired) requireRelogin();
      setActionState({ name: '', error: error.message || 'Não foi possível concluir a ação.' });
    }
  }

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
      stayNearConversationEndRef.current = true;

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
            className="ticket-detail ticket-detail-compact"
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

            <TicketAIControls
              status={aiStatus}
              config={aiConfig}
              active={!closed}
              busy={aiState.busy}
              result={aiState.result}
              error={aiState.error}
              onSuggest={() => runAI('suggest')}
              onPause={() => runAI('pause')}
              onResume={() => runAI('resume')}
              onConfigure={openAIConfig}
            />

            {aiConfig && aiConfigOpen && <section className="ticket-ai-details">
              <h3>Configurações da IA</h3>
              <TicketAISettings
              config={aiConfig}
              saving={aiConfigState.saving}
              error={aiConfigState.error}
              onChange={(key, value) => setAiConfig(previous => ({ ...previous, [key]: value }))}
              onSave={saveAIConfig}
              onCancel={() => setAiConfigOpen(false)}
              />
            </section>}

            <div className="ticket-actions">
              {ticket.actions?.canClaim && <button className="button" disabled={Boolean(actionState.name)} onClick={() => runAction('claim')}>{actionState.name === 'claim' ? 'Assumindo...' : 'Assumir ticket'}</button>}
              {ticket.actions?.canClose && !closeForm && <button className="button button-outline" disabled={Boolean(actionState.name)} onClick={() => setCloseForm(true)}>Encerrar ticket</button>}
              {ticket.actions?.canReopen && <button className="button" disabled={Boolean(actionState.name)} onClick={() => runAction('reopen')}>{actionState.name === 'reopen' ? 'Reabrindo...' : 'Reabrir ticket'}</button>}
              {actionState.error && <p className="dashboard-notice" role="alert">{actionState.error}</p>}
            </div>

            {closeForm && <form className="ticket-close-form" onSubmit={event => { event.preventDefault(); runAction('close', { reason: closeReason, summary: closeSummary }); }}>
              <label>Motivo<textarea required maxLength={1000} value={closeReason} onChange={event => setCloseReason(event.target.value)} /></label>
              <label>Resumo (opcional)<textarea maxLength={1000} value={closeSummary} onChange={event => setCloseSummary(event.target.value)} /></label>
              <div><button type="button" className="button button-outline" disabled={Boolean(actionState.name)} onClick={() => setCloseForm(false)}>Cancelar</button><button className="button" disabled={!closeReason.trim() || Boolean(actionState.name)}>{actionState.name === 'close' ? 'Encerrando...' : 'Confirmar encerramento'}</button></div>
            </form>}
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
                  (message, index) => {
                    const grouped = !closed && isGroupedWithPrevious(message, displayedMessages[index - 1]);
                    return (
                    <li
                      className={`${closed ? 'ticket-message' : 'ticket-chat-message'} ticket-message-${message.authorType.toLowerCase()} ${!closed && message.isOwn && !['AI', 'SYSTEM'].includes(message.authorType) ? 'ticket-chat-own' : ''} ${grouped ? 'ticket-message-grouped' : ''}`}
                      key={message.id}
                    >
                      {!grouped && <header>
                        <MessageAvatar message={message} />
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
                      </header>}

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
                        <MessageContent content={message.content} mentions={message.mentions} />
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
                            className="ticket-revision-toggle"
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
                    );
                  },
                )}
                {!closed && <li ref={conversationEndRef} aria-hidden="true" />}
              </ol>
            ) : (
              <p
                className="dashboard-notice"
                role="status"
              >
                Ainda não há mensagens neste atendimento.
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
                  onKeyDown={event => {
                    if (shouldSubmitOnEnter({
                      key: event.key,
                      shiftKey: event.shiftKey,
                      isComposing: event.nativeEvent?.isComposing,
                      sending: composer.sending,
                      retryPending: composer.retryPending,
                      draft: composer.draft,
                    })) {
                      event.preventDefault();
                      void handleSubmit(event);
                    }
                  }}
                  placeholder="Escreva sua mensagem..."
                  maxLength={1800}
                  rows={4}
                  disabled={
                    composer.sending ||
                    composer.retryPending
                  }
                />

                {mentionOptions.length > 0 && (
                  <div className="ticket-mention-options" role="listbox" aria-label="Participantes para mencionar">
                    {mentionOptions.map(person => (
                      <button type="button" role="option" key={person.id} onMouseDown={event => {
                        event.preventDefault();
                        composer.setDraft(insertMention(composer.draft, person));
                      }}>
                        @{person.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="ticket-composer-footer">
                  <span className="ticket-composer-hint">
                    Enter para enviar - Shift+Enter para nova linha
                  </span>
                  <span className="ticket-composer-count">
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
                {closed ? 'Este ticket está encerrado.' : ticket.actions?.canClaim ? 'Assuma este ticket para responder.' : 'Você não pode responder neste atendimento no momento.'}
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
