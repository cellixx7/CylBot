function setCorsHeaders(response, webOrigin = 'http://localhost:5173', request) {
  response.setHeader('Vary', 'Origin');
  if (request?.headers?.origin && request.headers.origin !== webOrigin) return;
  response.setHeader('Access-Control-Allow-Origin', webOrigin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { setCorsHeaders };
