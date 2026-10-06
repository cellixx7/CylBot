import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  editTicketMessage,
  getMessages,
  getMessageRevisions,
  getTicket,
  getTicketAIConfig,
  getTicketAIStatus,
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
import { conversationDay, isGroupedWithPrevious } from './conversationPresentation.js';
import './tickets.css';

import { Status, PollStatus, Pagination, date, shortTime, href } from './TicketShared.jsx';
import TicketDialog from './TicketDialog.jsx';
import TicketTools from './TicketTools.jsx';
import MessageAttachments from './MessageAttachments.jsx';
const authors = { USER: 'Usuário', STAFF: 'Equipe', AI: 'IA', SYSTEM: 'Sistema' };
const origins = { DISCORD: 'Discord', WEB: 'Web', AI: 'IA', SYSTEM: 'Sistema' };
const deliveries = { PENDING: 'Entrega pendente', SENDING: 'Em entrega', SENT: 'Entregue ao Discord', FAILED: 'Falha na entrega ao Discord', NOT_REQUIRED: 'Sem entrega necessária' };
export default function TicketConversation({
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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [aiConfigState, setAiConfigState] = useState({ saving: false, error: '' });
  const [clock, setClock] = useState(Date.now());

  const messageAttemptRef = useRef(null);
  const conversationEndRef = useRef(null);
  const conversationScrollRef = useRef(null);
  const [retryError, setRetryError] = useState('');
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
  const reopenAvailableAt = ticket?.reopenAvailableAt ? Date.parse(ticket.reopenAvailableAt) : 0;
  const reopenRetryAfterSeconds = Math.max(0, Math.ceil((reopenAvailableAt - clock) / 1000));

  useEffect(() => {
    if (!reopenAvailableAt || reopenAvailableAt <= Date.now()) return undefined;
    const timer = setTimeout(() => setClock(Date.now()), reopenAvailableAt - Date.now() + 25);
    return () => clearTimeout(timer);
  }, [reopenAvailableAt]);

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
    const node = conversationScrollRef.current;
    if (node && !before && stayNearConversationEndRef.current) node.scrollTop = node.scrollHeight;
  }, [before, displayedMessages.length, ticket?.status]);
  useEffect(() => {
    if (state.stopped && !state.data) { setTicketOverride(null); setLocalMessages([]); setAiOverride(null); }
  }, [state.stopped, state.data]);

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
      if (action === 'suggest') setAssistantOpen(false);
    } catch (error) {
      if (error.reloginRequired) requireRelogin();
      setAiState({ busy: '', error: error.message || 'Não foi possível concluir a ação da IA.', result: aiState.result });
    }
  }

  async function openAIConfig() {
    if (aiState.busy) return;
    if (aiConfig) {
      setAiConfigOpen(true);
      setAssistantOpen(false);
      return;
    }
    setAiState(previous => ({ ...previous, busy: 'config', error: '' }));
    try {
      const result = await getTicketAIConfig(guildId);
      setAiConfig(result.config);
      setAiConfigOpen(true);
      setAssistantOpen(false);
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
      if (['close', 'conclude'].includes(action)) setCloseForm(false);
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

    upsertLocalMessage({ ...retriedMessage, isOwn: message.isOwn });
    setRetryError('');
  } catch (error) {
    if (error.reloginRequired) {
      requireRelogin();
    }

    setRetryError(error.message || 'Não foi possível reenviar a mensagem.');
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

  return <div className="ticket-conversation">
    <a className="ticket-mobile-back text-link" href={href(guildId)}>← Tickets</a>
    <PollStatus state={state} />
    {state.error && state.data && <p className="ticket-stale" role="status">Exibindo a última leitura válida da conversa.</p>}
    {ticket && state.data && <>
      <header className="ticket-conversation-header">
        <div className="ticket-conversation-title"><span>#{ticket.publicNumber}</span><h2>{ticket.subject}</h2><Status value={ticket.status} /></div>
        <p className="ticket-conversation-meta">{ticket.creatorName || 'Usuário'} · {ticket.categoryName || 'Sem categoria'}<br />Responsável: {ticket.assignedName || 'Não atribuído'} · {date(ticket.createdAt)}</p>
        <div className="ticket-actions">
          {ticket.actions?.canClaim && <button className="button" disabled={Boolean(actionState.name)} onClick={() => runAction('claim')}>{actionState.name === 'claim' ? 'Assumindo...' : 'Assumir'}</button>}
          {ticket.actions?.canClose && <button className="button button-outline" disabled={Boolean(actionState.name)} onClick={() => ticket.finalizing ? runAction('close', { reason: '', summary: '' }) : setCloseForm('close')}>{ticket.finalizing ? 'Retomar encerramento' : 'Fechar ticket'}</button>}
          {ticket.actions?.canConclude && <button className="button button-outline ticket-conclude-button" disabled={Boolean(actionState.name)} onClick={() => ticket.finalizing ? runAction('conclude', { reason: '', summary: '' }) : setCloseForm('conclude')}>{ticket.finalizing ? 'Retomar conclusão' : 'Concluir ticket'}</button>}
          {(ticket.actions?.canReopen || reopenRetryAfterSeconds > 0) && <button className="button" disabled={Boolean(actionState.name) || reopenRetryAfterSeconds > 0} onClick={() => runAction('reopen')}>{actionState.name === 'reopen' ? 'Reabrindo...' : reopenRetryAfterSeconds > 0 ? `Reabrir em ${reopenRetryAfterSeconds}s` : 'Reabrir ticket'}</button>}
          <TicketTools guildId={guildId} ticketId={ticketId} available={state.data.tools?.available} requireRelogin={requireRelogin} />
        </div>
        {actionState.error && <p role="alert">{actionState.error}</p>}
        <div className="ticket-context-panels">
          <button type="button" className="ticket-context-trigger" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(true)}>Detalhes</button>
          {aiStatus && <button type="button" className="ticket-context-trigger" aria-expanded={assistantOpen} onClick={() => setAssistantOpen(true)}>Assistente · {aiStatus.assistantName || 'CYL'}</button>}
        </div>
      </header>
      {detailsOpen && <TicketDialog title="Detalhes do ticket" onClose={() => setDetailsOpen(false)}><p className="ticket-content">{ticket.description}</p>{ticket.closedAt && <p>Última finalização: {date(ticket.closedAt)}</p>}{ticket.reopenedAt && <p>Reaberto em: {date(ticket.reopenedAt)}</p>}
            {state.data.history?.length > 0 && <ol className="ticket-audit">{state.data.history.map((event, index) => <li key={index}><time>{date(event.createdAt)}</time> · {({ TICKET_CREATED: 'Ticket aberto', TICKET_CLAIMED: 'Assumido', TICKET_CLOSED: 'Encerrado', TICKET_CONCLUDED: 'Concluído', TICKET_REOPENED: 'Reaberto', TICKET_TOOL: 'Ferramenta' })[event.type] || 'Evento'}{event.action ? ' · ' + event.action : ''}{event.result ? ' · ' + (event.result === 'success' ? 'Confirmado' : 'Negado/falhou') : ''}</li>)}</ol>}
      </TicketDialog>}
      {assistantOpen && <TicketDialog title={`Assistente · ${aiStatus?.assistantName || 'CYL'}`} busy={Boolean(aiState.busy)} onClose={() => setAssistantOpen(false)}><TicketAIControls status={aiStatus} config={aiConfig} active={!closed} busy={aiState.busy} error={aiState.error} onSuggest={() => runAI('suggest')} onPause={() => runAI('pause')} onResume={() => runAI('resume')} onConfigure={openAIConfig} /></TicketDialog>}
      {aiConfig && aiConfigOpen && <TicketDialog title="Configurações da IA" busy={aiConfigState.saving} onClose={() => setAiConfigOpen(false)}><TicketAISettings config={aiConfig} saving={aiConfigState.saving} error={aiConfigState.error} onChange={(key, value) => setAiConfig(previous => ({ ...previous, [key]: value }))} onSave={saveAIConfig} onCancel={() => setAiConfigOpen(false)} /></TicketDialog>}
      {closeForm && <TicketDialog title={closeForm === 'conclude' ? 'Concluir ticket' : 'Fechar ticket'} busy={Boolean(actionState.name)} onClose={() => setCloseForm(false)}>
        <p>{closeForm === 'conclude' ? 'Marque o problema como solucionado e registre a solução.' : 'O ticket será encerrado sem ser marcado como resolvido.'}</p>
        <form className="ticket-dialog-form" onSubmit={event => { event.preventDefault(); runAction(closeForm, { reason: closeReason, summary: closeSummary }); }}>
          <label>{closeForm === 'conclude' ? 'Motivo interno (opcional)' : 'Motivo'}<textarea required={closeForm === 'close'} maxLength={1000} disabled={Boolean(actionState.name)} value={closeReason} onChange={event => setCloseReason(event.target.value)} /></label>
          <label>{closeForm === 'conclude' ? 'Solução / resumo' : 'Resumo (opcional)'}<textarea required={closeForm === 'conclude'} maxLength={1000} disabled={Boolean(actionState.name)} value={closeSummary} onChange={event => setCloseSummary(event.target.value)} /></label>
          {actionState.error && <p role="alert">{actionState.error}</p>}
          <div className="ticket-dialog-actions"><button type="button" className="button button-outline" disabled={Boolean(actionState.name)} onClick={() => setCloseForm(false)}>Cancelar</button><button className="button" disabled={Boolean(actionState.name) || !(closeForm === 'close' ? closeReason.trim() : closeSummary.trim())}>{actionState.name ? 'Finalizando...' : closeForm === 'conclude' ? 'Concluir ticket' : 'Fechar ticket'}</button></div>
        </form>
      </TicketDialog>}
      <section className="ticket-conversation-scroll" aria-label={closed ? 'Histórico da conversa' : 'Conversa'} ref={conversationScrollRef} onScroll={event => { const node = event.currentTarget; stayNearConversationEndRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 140; }}>
        <Pagination cursors={cursors} setCursors={setCursors} nextBefore={state.data.nextBefore} history />
                    {displayedMessages.length ? (
              <ol
                className="ticket-chat-messages"
                aria-label="Mensagens em ordem cronológica"
              >
                {displayedMessages.map(
                  (message, index) => {
                    const grouped = isGroupedWithPrevious(message, displayedMessages[index - 1]);
                    return (
                    <Fragment key={message.id}>
                    {(!index || new Date(message.createdAt).toDateString() !== new Date(displayedMessages[index - 1].createdAt).toDateString()) && <li className="ticket-day-separator"><span>{conversationDay(message.createdAt)}</span></li>}
                    <li
                      className={`ticket-chat-message ticket-message-${message.authorType.toLowerCase()} ${message.isOwn && message.authorType === 'STAFF' && message.origin === 'WEB' ? 'ticket-chat-own' : ''} ${grouped ? 'ticket-message-grouped' : ''}`}
                      key={message.id}
                    >
                      <header>
                        {!grouped && <>
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
                        </>}

                        <time
                          dateTime={new Date(
                            message.createdAt,
                          ).toISOString()}
                        >
                          {shortTime(message.createdAt)}
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
                        <MessageContent content={message.content} mentions={message.mentions} />
                      )}

                      <MessageAttachments attachments={message.attachments} />
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
                      {message.origin === 'WEB' && <footer className="ticket-delivery"><span>{deliveries[message.deliveryStatus]}</span>{!closed && canRespond && message.deliveryStatus === 'FAILED' && <button type="button" className="ticket-revision-toggle" disabled={Boolean(retryingMessageId)} onClick={() => handleRetryMessage(message)}>{retryingMessageId === message.id ? 'Reenviando...' : 'Reenviar mensagem'}</button>}</footer>}
                    </li>
                    </Fragment>
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


      </section>
      <div className="ticket-conversation-bottom">
        {retryError && <p role="alert">{retryError}</p>}
        {aiState.result?.proposal && <section className="ticket-ai-suggestion" aria-label="Sugestão da IA"><strong>Sugestão de {aiStatus?.assistantName || 'CYL'}</strong><p className="ticket-content">{aiState.result.proposal.message || 'Nenhuma resposta sugerida.'}</p><div className="ticket-actions">{canRespond && aiState.result.proposal.message && <button className="button button-outline" type="button" disabled={composer.sending || composer.retryPending} onClick={() => { composer.setDraft(aiState.result.proposal.message); setAiState(previous => ({ ...previous, result: null })); }}>Usar resposta</button>}<button className="button button-outline" type="button" onClick={() => setAiState(previous => ({ ...previous, result: null }))}>Descartar</button></div></section>}
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
                  rows={2}
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
                {closed ? ticket.status === 'CONCLUDED' ? 'Este ticket foi concluído. A conversa está em modo de histórico.' : 'Este ticket está encerrado. A conversa está em modo de histórico.' : ticket.actions?.canClaim ? 'Assuma este ticket para responder.' : 'Você não pode responder neste atendimento no momento.'}
              </p>
            )}

      </div>
    </>}
  </div>;
}
