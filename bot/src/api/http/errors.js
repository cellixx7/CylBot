const controlledErrors = new WeakSet();
function clientError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  controlledErrors.add(error);
  return error;
}

function codedClientError(statusCode, code, message, { retryAfter, retryAfterSeconds } = {}) {
  const error = clientError(statusCode, message);
  error.code = code;
  if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = Math.ceil(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) error.retryAfterSeconds = Math.ceil(retryAfterSeconds);
  return error;
}

module.exports = { clientError, codedClientError, isClientError: error => controlledErrors.has(error) || error?.isClientError === true };
