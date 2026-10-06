export default function TicketStatusSummary({ stats }) {
  return <dl className="ticket-status-summary" aria-label="Estatísticas dos tickets acessíveis">{[['open', 'Abertos'], ['closed', 'Encerrados'], ['concluded', 'Concluídos']].map(([key, label]) => <div key={key}><dd>{Number.isFinite(stats?.[key]) ? stats[key].toLocaleString('pt-BR') : '—'}</dd><dt>{label}</dt></div>)}</dl>;
}
