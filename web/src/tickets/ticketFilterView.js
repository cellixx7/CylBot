export const emptyFilters = { status: '', category: '', assigned: '', period: '', from: '', to: '' };
export const periodLabels = { today: 'Hoje', week: 'Últimos 7 dias', month30: 'Últimos 30 dias', month: 'Este mês', custom: 'Personalizado' };
export function filterQuery(filters, now = new Date()) {
  const query = Object.fromEntries(['status', 'category', 'assigned'].filter(key => filters[key]).map(key => [key, filters[key]]));
  let from; let to;
  if (filters.period === 'custom') {
    if (filters.from) from = new Date(`${filters.from}T00:00:00`);
    if (filters.to) to = new Date(`${filters.to}T23:59:59.999`);
  } else if (filters.period) {
    from = new Date(now); from.setHours(0, 0, 0, 0);
    to = new Date(now); to.setHours(23, 59, 59, 999);
    if (filters.period === 'week') from.setDate(from.getDate() - 6);
    if (filters.period === 'month30') from.setDate(from.getDate() - 29);
    if (filters.period === 'month') from.setDate(1);
  }
  if (from) query.from = from.toISOString();
  if (to) query.to = to.toISOString();
  return query;
}
export function filterChips(filters, categories = [], assignees = [], statuses = {}) {
  return [
    filters.status && { key: 'status', label: `Status: ${statuses[filters.status] || filters.status}` },
    filters.category && { key: 'category', label: `Categoria: ${categories.find(item => item.id === filters.category)?.name || filters.category}` },
    filters.assigned && { key: 'assigned', label: `Responsável: ${filters.assigned === 'me' ? 'Eu' : filters.assigned === 'unassigned' ? 'Não atribuído' : assignees.find(item => item.id === filters.assigned)?.name || filters.assigned}` },
    filters.period && { key: 'period', label: filters.period === 'custom' ? `Data: ${filters.from || 'início'} — ${filters.to || 'hoje'}` : periodLabels[filters.period] },
  ].filter(Boolean);
}
