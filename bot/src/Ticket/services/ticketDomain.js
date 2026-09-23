const { TICKET_STATUS: S } = require('./ticketConstants');
const errors = require('../domain/ticketErrors');
const { TicketInvalidStateError } = errors;

const TRANSITIONS = Object.freeze({
  [S.OPEN]: new Set([S.CLAIMED, S.CLOSED]),
  [S.CLAIMED]: new Set([S.CLOSED]),
  [S.CLOSED]: new Set([S.REOPENED]),
  [S.REOPENED]: new Set([S.CLAIMED, S.CLOSED]),
});

function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.has(to));
}

function transition(ticket, nextStatus) {
  if (!canTransition(ticket.status, nextStatus)) {
    throw new TicketInvalidStateError(`Transição de ticket inválida: ${ticket.status} para ${nextStatus}.`);
  }
  ticket.status = nextStatus;
  return ticket;
}

function assertActiveState(ticket) {
  if (![S.OPEN, S.CLAIMED, S.REOPENED].includes(ticket.status)) {
    throw new TicketInvalidStateError('Este ticket não está aberto.');
  }
}

module.exports = {
  TRANSITIONS,
  ...errors,
  canTransition,
  transition,
  assertActiveState,
};
