const controlledErrors = new WeakSet();
function clientError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  controlledErrors.add(error);
  return error;
}

module.exports = { clientError, isClientError: error => controlledErrors.has(error) };
