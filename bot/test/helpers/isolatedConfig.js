const { mock, after } = require('node:test');
const env = require('../../src/config/env');

// Importar antes dos módulos que montam singletons. Não lê .env/process.env.
// Cada arquivo de teste roda em seu próprio processo no runner padrão.
const stub = mock.method(env, 'getConfig', () => env.loadEnv({}, { requireDiscord: false }));
after(() => stub.mock.restore());
