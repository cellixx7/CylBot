import { Status, Pagination, PollStatus, date, href } from './TicketShared.jsx';
export default function TicketQueue({ guildId, selectedId, state, cursors, setCursors }) {
  return <aside className="ticket-queue" aria-label="Fila de tickets"><header><h2>Fila de tickets</h2><span>{state.data?.tickets.length ?? '—'} nesta página</span></header>
    <div className="ticket-queue-scroll"><PollStatus state={state} />{state.error && state.data && <p className="ticket-stale" role="status">Exibindo a última leitura válida.</p>}
      {state.data && (state.data.tickets.length ? <ul className="ticket-queue-list" aria-label="Tickets acessíveis">{state.data.tickets.map(ticket => <li key={ticket.id}><a href={href(guildId, ticket.id)} className={`ticket-queue-row ${ticket.id === selectedId ? 'is-selected' : ''}`} aria-current={ticket.id === selectedId ? 'page' : undefined}>
        <div className="ticket-queue-heading"><strong>#{ticket.publicNumber}</strong><Status value={ticket.status} /></div><h3>{ticket.subject}</h3><p>{ticket.categoryName || 'Sem categoria'} · {ticket.creatorName || 'Usuário'}</p><p>Responsável: {ticket.assignedName || 'Não atribuído'}</p><time dateTime={new Date(ticket.createdAt).toISOString()}>{date(ticket.createdAt)}</time>
      </a></li>)}</ul> : <p className="ticket-queue-empty" role="status">Nenhum ticket encontrado para estes filtros.</p>)}
    </div>{state.data && <Pagination cursors={cursors} setCursors={setCursors} nextBefore={state.data.nextBefore} />}
  </aside>;
}
