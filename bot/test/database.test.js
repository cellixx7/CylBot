require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadEnv } = require('../src/config/env');
const { AuthService } = require('../src/services/authService');
const { AuthSessionManager } = require('../src/services/authSessionManager');

test('DATABASE_URL fica centralizada na configuração e não é retornada por health/config pública', () => {
  const config = loadEnv({ DATABASE_URL: 'postgresql://cylbot:cylbot_dev@localhost:5432/cylbot' }, { requireDiscord: false });
  assert.equal(config.database.url, 'postgresql://cylbot:cylbot_dev@localhost:5432/cylbot');
  assert.equal(Object.prototype.hasOwnProperty.call(config, 'password'), false);
});

test('OAuth faz upsert do perfil Discord antes de criar a sessão', async () => {
  const profile = { id: '123456789012345678', username: 'user', displayName: 'User', avatarUrl: 'https://cdn.example/avatar.png' };
  const calls = [];
  const auth = new AuthService({
    config: loadEnv({ DISCORD_CLIENT_ID: profile.id, DISCORD_OAUTH_CLIENT_SECRET: 'secret' }, { requireDiscord: false }).auth,
    provider: {
      authorizationUrl: state => `https://discord.test/${state}`,
      exchangeCode: async () => ({ access_token: 'token', expires_in: 3600, token_type: 'Bearer' }),
      getUser: async () => profile,
    },
    users: { upsertDiscordUser: async user => calls.push(user) },
    sessions: new AuthSessionManager(),
  });
  const started = auth.begin();
  const session = await auth.complete({ ...started, code: 'code' });
  assert.equal(session.user.id, profile.id);
  assert.deepEqual(calls, [profile]);
});
