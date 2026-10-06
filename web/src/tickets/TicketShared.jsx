const statuses = {
  OPEN: 'Aberto',
  CLAIMED: 'Em atendimento',
  CLOSED: 'Encerrado',
  CONCLUDED: 'Concluído',
  REOPENED: 'Reaberto',
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


export { Status, PollStatus, Pagination, statuses, date, shortTime, href };
