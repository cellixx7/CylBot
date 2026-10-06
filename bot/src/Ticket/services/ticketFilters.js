const { clientError } = require('../../api/http/errors');
const { TICKET_STATUS } = require('./ticketConstants');

// Parse the same allowlist in HTTP and service entry points. Identity remains session-derived.
function ticketFilters(input = {}) {
  const filters = {};
  const invalid = () => { throw clientError(400, 'Filtros de tickets inválidos.'); };
  for (const key of ['status', 'category', 'assigned', 'from', 'to', 'search']) {
    const value = input[key];
    if (value == null || value === '') continue;
    if (typeof value !== 'string') invalid();
    if (key === 'status' && !Object.values(TICKET_STATUS).includes(value)) invalid();
    if (key === 'category' && !/^[A-Za-z0-9_-]{1,100}$/.test(value)) invalid();
    if (key === 'assigned' && !['me', 'unassigned'].includes(value) && !/^\d{17,20}$/.test(value)) invalid();
    if (['from', 'to'].includes(key)) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) invalid();
      const date = new Date(value);
      if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) invalid();
    }
    if (key === 'search' && (value.length > 100 || /[\u0000-\u001f]/.test(value))) invalid();
    filters[key] = key === 'search' ? value.trim() : value;
  }
  if (filters.from && filters.to && filters.from > filters.to) invalid();
  return filters;
}

module.exports = { ticketFilters };
