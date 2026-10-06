import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, MessagesSquare } from 'lucide-react';
import { getTickets } from './ticketsApi.js';
import { useTicketPolling } from './useTicketPolling.js';
import TicketQueue from './TicketQueue.jsx';
import TicketConversation from './TicketConversation.jsx';
import TicketFilters from './TicketFilters.jsx';
import TicketStatusSummary from './TicketStatusSummary.jsx';
import { emptyFilters, filterQuery } from './ticketFilterView.js';
import './tickets.css';
export default function TicketsPage({ guildId, ticketId, requireRelogin, embedded = false }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [cursors, setCursors] = useState([null]);
  const [knownAssignees, setKnownAssignees] = useState([]);
  useEffect(() => { const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setCursors([null]); }, 300); return () => clearTimeout(timer); }, [search]);
  const query = useMemo(() => ({ ...filterQuery(filters), ...(debouncedSearch ? { search: debouncedSearch } : {}) }), [filters, debouncedSearch]);
  const before = cursors.at(-1);
  const load = useCallback(signal => getTickets(guildId, before, signal, query), [guildId, before, query]);
  const state = useTicketPolling(load, requireRelogin);
  useEffect(() => {
    if (!state.data) { if (state.stopped) setKnownAssignees([]); return; }
    setKnownAssignees(previous => {
      const people = new Map(previous.map(person => [person.id, person]));
      for (const ticket of state.data.tickets) if (ticket.assignedUserId) people.set(ticket.assignedUserId, { id: ticket.assignedUserId, name: ticket.assignedName || ticket.assignedUserId });
      return [...people.values()];
    });
  }, [state.data, state.stopped]);
  const Container = embedded ? 'section' : 'main';
  return <Container className={`${embedded ? 'server-tickets' : 'dashboard-page'} tickets-page ${ticketId ? 'has-selection' : ''}`}>
    <header className="ticket-central-heading"><div><p className="eyebrow">ATENDIMENTO</p><h1>Tickets</h1><p className="description">Acompanhe e resolva solicitações da sua comunidade.</p></div><TicketStatusSummary stats={state.data?.stats} /></header>
    <div className="ticket-search-bar"><label className="ticket-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Pesquisar tickets</span><input type="search" placeholder="Pesquisar tickets" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></label><TicketFilters filters={filters} categories={state.data?.categories || []} assignees={knownAssignees} onChange={values => { setFilters(values); setCursors([null]); }} /></div>
    <div className="ticket-central-board"><TicketQueue guildId={guildId} selectedId={ticketId} state={state} cursors={cursors} setCursors={setCursors} />{ticketId ? <TicketConversation key={ticketId} guildId={guildId} ticketId={ticketId} requireRelogin={requireRelogin} onUpdated={state.retry} /> : <div className="ticket-conversation-empty"><MessagesSquare size={34} aria-hidden="true" /><h2>Selecione um ticket</h2><p>Selecione um ticket para visualizar a conversa.</p>{Number.isFinite(state.data?.stats?.open) && <span>{state.data.stats.open} tickets abertos</span>}</div>}</div>
  </Container>;
}
