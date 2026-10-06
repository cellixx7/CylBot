const TICKET_STATUS = Object.freeze({ OPEN: 'OPEN', CLAIMED: 'CLAIMED', CLOSED: 'CLOSED', CONCLUDED: 'CONCLUDED', REOPENED: 'REOPENED' });
const TICKET_EVENT = Object.freeze({ CREATED: 'TICKET_CREATED', CLAIMED: 'TICKET_CLAIMED', CLOSED: 'TICKET_CLOSED', CONCLUDED: 'TICKET_CONCLUDED', REOPENED: 'TICKET_REOPENED', TOOL: 'TICKET_TOOL' });
const FINAL_STATUSES = new Set([TICKET_STATUS.CLOSED, TICKET_STATUS.CONCLUDED]);
const DEFAULT_CATEGORIES = Object.freeze([
  { id: 'support', name: 'Suporte', description: 'Ajuda com o servidor e seus recursos.' },
  { id: 'report', name: 'Denúncia', description: 'Relate uma situação à equipe.' },
  { id: 'billing', name: 'Financeiro', description: 'Dúvidas sobre pagamentos.' },
  { id: 'other', name: 'Outro', description: 'Outros assuntos.' },
]);
const ACTIVE_STATUSES = new Set([TICKET_STATUS.OPEN, TICKET_STATUS.CLAIMED, TICKET_STATUS.REOPENED]);
const ticketNumber = ticket => String(ticket.sequence).padStart(6, '0');
module.exports = { TICKET_STATUS, TICKET_EVENT, DEFAULT_CATEGORIES, ACTIVE_STATUSES, FINAL_STATUSES, ticketNumber };
