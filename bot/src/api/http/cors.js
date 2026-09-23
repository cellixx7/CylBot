function setCorsHeaders(response, { webOrigin, allowedOrigins }, request) {
  response.setHeader('Vary', 'Origin');
  const origin = request?.headers?.origin;
  if (origin !== undefined && !allowedOrigins.includes(origin)) return;
  response.setHeader('Access-Control-Allow-Origin', origin || webOrigin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { setCorsHeaders };
