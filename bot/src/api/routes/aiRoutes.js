const { readJson, sendJson } = require('../http/json');

async function handle(request, response, { services }) {
  if (request.method !== 'POST' || request.url !== '/api/ai/generate') return false;
  const body = await readJson(request);
  const generated = await services.textaAI.generate(body, {
    trimText: true,
    minTargetCharacters: 20,
    maxContextLength: 2000,
  });
  sendJson(response, 200, { generated });
  return true;
}

module.exports = { handle };
