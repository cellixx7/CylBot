function setCorsHeaders(response, webOrigin = 'http://localhost:5173') {
  response.setHeader('Access-Control-Allow-Origin', webOrigin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { setCorsHeaders };
