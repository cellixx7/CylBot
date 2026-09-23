class TicketDomainError extends Error {
  constructor(message, statusCode = 409) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isClientError = true;
  }
}

class TicketNotFoundError extends TicketDomainError {
  constructor() { super('Ticket não encontrado neste servidor.', 404); }
}

class TicketAlreadyClaimedError extends TicketDomainError {
  constructor(name, id) { super(name ? `Este ticket já está sendo atendido por ${name} (${id}).` : 'Este ticket já foi assumido.', 409); }
}

class TicketInvalidStateError extends TicketDomainError {
  constructor(message = 'O ticket não está em um estado válido para esta operação.') { super(message, 409); }
}

class TicketConfigurationError extends TicketDomainError {
  constructor(message) { super(message, 409); }
}

class TicketPermissionError extends TicketDomainError {
  constructor(message) { super(message, 403); }
}

class TicketLimitError extends TicketDomainError {
  constructor(message) { super(message, 409); }
}

module.exports = {
  TicketDomainError,
  TicketNotFoundError,
  TicketAlreadyClaimedError,
  TicketInvalidStateError,
  TicketConfigurationError,
  TicketPermissionError,
  TicketLimitError,
};
