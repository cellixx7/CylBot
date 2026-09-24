import { useCallback, useState } from 'react';
import { getMessages, getTicket, getTickets } from './ticketsApi.js';
import { useTicketComposer } from './useTicketComposer.js';
import { useTicketPolling } from './useTicketPolling.js';

const statuses = { OPEN: 'Aberto', CLAIMED: 'Em atendimento', CLOSED: 'Fechado', REOPENED: 'Reaberto' };
const authors = { USER: 'Usuário', STAFF: 'Equipe', AI: 'IA', SYSTEM: 'Sistema' };
const origins = { DISCORD: 'Discord', WEB: 'Web', AI: 'IA', SYSTEM: 'Sistema' };
const deliveries = { PENDING: 'Entrega pendente', SENDING: 'Em entrega', SENT: 'Entregue ao Discord', FAILED: 'Falha na entrega ao Discord', NOT_REQUIRED: 'Sem entrega necessária' };
const date = value => value == null ? '—' : new Date(value).toLocaleString('pt-BR');
const href = (guildId, ticketId) => `#/dashboard/${guildId}/tickets${ticketId ? `/${ticketId}` : ''}`;

function Status({ value }) { return <span className={`ticket-status ticket-status-${value.toLowerCase()}`}>{statuses[value] || value}</span>; }

function PollStatus({ state }) {
  return <div className="ticket-poll-status">
    {state.loading && <p role="status">Carregando tickets...</p>}
    {state.error && <div role="alert"><p>{state.error}</p><button className="button button-outline" disabled={state.refreshing || state.retryAt > Date.now()} onClick={state.retry}>Tentar novamente</button></div>}
    {state.retryAt && <p>Próxima tentativa a partir de {date(state.retryAt)}, com a aba visível.</p>}
    {state.updatedAt && <p>{state.error ? 'Dados da última consulta: ' : 'Atualizado em '}{date(state.updatedAt)}.{!state.error && ' Atualização automática a cada 15 segundos com a aba visível.'}</p>}
  </div>;
}

function Pagination({ cursors, setCursors, nextBefore, history = false }) {
  return <nav className="ticket-pagination" aria-label={history ? 'Páginas de mensagens' : 'Páginas de tickets'}>
    {cursors.length > 1 && <>
      <button className="button button-outline" onClick={() => setCursors([null])}>Voltar {history ? 'às últimas mensagens' : 'ao início'}</button>
      {cursors.length > 2 && <button className="button button-outline" onClick={() => setCursors(cursors.slice(0, -1))}>Página mais recente</button>}
    </>}
    <span>{cursors.length === 1 ? (history ? 'Mensagens mais recentes' : 'Tickets mais recentes') : `Página ${cursors.length}`}</span>
    {nextBefore != null && <button className="button button-outline" onClick={() => setCursors([...cursors, nextBefore])}>{history ? 'Mensagens anteriores' : 'Tickets anteriores'} →</button>}
  </nav>;
}

function TicketList({ guildId, requireRelogin }) {
  const [cursors, setCursors] = useState([null]);
  const composer = useTicketComposer({
  guildId,
  ticketId,
  requireRelogin,
});
  const before = cursors.at(-1);
  const load = useCallback(signal => getTickets(guildId, before, signal), [guildId, before]);
  const state = useTicketPolling(load, requireRelogin);
  return <>
    <PollStatus state={state} />
    {state.data && <>
      <Pagination cursors={cursors} setCursors={setCursors} nextBefore={state.data.nextBefore} />
      {state.data.tickets.length ? <ul className="ticket-list" aria-label="Tickets acessíveis">
        {state.data.tickets.map(ticket => <li key={ticket.id}>
          <a className="ticket-card" href={href(guildId, ticket.id)}>
            <div className="ticket-card-heading"><span>#{ticket.publicNumber}</span><Status value={ticket.status} /></div>
            <h2>{ticket.subject}</h2>
            <p>{ticket.categoryName || 'Sem categoria'} · {ticket.creatorName || 'Usuário'}</p>
            <p>Responsável: {ticket.assignedName || 'Não atribuído'}</p>
            <small>Aberto em {date(ticket.createdAt)}</small>
            <span className="ticket-open">Ver conversa →</span>
          </a>
        </li>)}
      </ul> : <p className="dashboard-notice" role="status">Nenhum ticket disponível para você nesta página.</p>}
    </>}
  </>;
}

function TicketDetail({ guildId, ticketId, requireRelogin }) {
  const [cursors, setCursors] = useState([null]);
  const before = cursors.at(-1);
  const load = useCallback(async signal => {
    const [detail, page] = await Promise.all([getTicket(guildId, ticketId, signal), getMessages(guildId, ticketId, before, signal)]);
    return { ...detail, ...page };
  }, [guildId, ticketId, before]);
  const state = useTicketPolling(load, requireRelogin);
  const ticket = state.data?.ticket;
  return <>
    <PollStatus state={state} />
    {ticket && <>
      <section className="ticket-detail" aria-label="Informações do ticket">
        <div className="ticket-card-heading"><span>Ticket #{ticket.publicNumber}</span><Status value={ticket.status} /></div>
        <h2>{ticket.subject}</h2>
        <p className="ticket-content">{ticket.description}</p>
        <dl className="ticket-metadata">
          <div><dt>Servidor</dt><dd>{ticket.guildName || guildId}</dd></div>
          <div><dt>Categoria</dt><dd>{ticket.categoryName || 'Sem categoria'}</dd></div>
          <div><dt>Criador</dt><dd>{ticket.creatorName || 'Usuário'}</dd></div>
          <div><dt>Responsável</dt><dd>{ticket.assignedName || 'Não atribuído'}</dd></div>
          <div><dt>Aberto em</dt><dd>{date(ticket.createdAt)}</dd></div>
          {ticket.claimedAt && <div><dt>Assumido em</dt><dd>{date(ticket.claimedAt)}</dd></div>}
          {ticket.closedAt && <div><dt>Último encerramento</dt><dd>{date(ticket.closedAt)}</dd></div>}
          {ticket.reopenedAt && <div><dt>Reaberto em</dt><dd>{date(ticket.reopenedAt)}</dd></div>}
        </dl>
      </section>
      <section className="ticket-history" aria-labelledby="ticket-history-title">
        <h2 id="ticket-history-title">Histórico da conversa</h2>
        <p className="description">{before ? 'Você está consultando uma página anterior do histórico.' : 'As mensagens mais recentes aparecem ao final desta página.'}</p>
        <Pagination cursors={cursors} setCursors={setCursors} nextBefore={state.data.nextBefore} history />
        {state.data.messages.length ? <ol className="ticket-messages" aria-label="Mensagens em ordem cronológica">
          {state.data.messages.map(message => <li className={`ticket-message ticket-message-${message.authorType.toLowerCase()}`} key={message.id}>
            <header><strong>{message.authorName || authors[message.authorType]}</strong><span>{authors[message.authorType]} · {origins[message.origin]}</span>
              <time dateTime={new Date(message.createdAt).toISOString()}>{date(message.createdAt)}</time></header>
            {message.visibility !== 'PUBLIC' && <p className="ticket-visibility">{message.visibility === 'INTERNAL' ? 'Interna · visível à equipe' : 'Sistema · visível à equipe'}</p>}
            <p className="ticket-content">{message.content}</p>
            <footer>{deliveries[message.deliveryStatus]}{message.editedAt && ` · Editada em ${date(message.editedAt)}`}</footer>
          </li>)}
        </ol> : <p className="dashboard-notice" role="status">Ainda não há mensagens disponíveis nesta conversa. Tickets antigos podem ter histórico ainda não sincronizado.</p>}
      </section>
    </>}
  </>;
}

export default function TicketsPage({ guildId, ticketId, requireRelogin }) {
  return <main className="dashboard-page tickets-page">
    <a className="text-link" href={ticketId ? href(guildId) : '#/dashboard'}>← {ticketId ? 'Lista de tickets' : 'Todos os servidores'}</a>
    <header className="tickets-intro"><p className="eyebrow">ATENDIMENTO · SOMENTE LEITURA</p>
      <h1>{ticketId ? 'Conversa do ticket' : 'Seus tickets'}</h1>
      <p className="description">{ticketId ? 'Consulte os detalhes e o histórico. O envio de mensagens pelo painel ainda não está disponível.' : 'Tickets deste servidor aos quais você tem acesso, incluindo os encerrados.'}</p>
    </header>
    {ticketId ? <TicketDetail guildId={guildId} ticketId={ticketId} requireRelogin={requireRelogin} /> : <TicketList guildId={guildId} requireRelogin={requireRelogin} />}
  </main>;
}
