// Usa schema descartável isolado; nunca migra o schema da aplicação.
const { randomBytes } = require('node:crypto');
const { createDatabase } = require('../src/database/client');
const { getConfig } = require('../src/config/env');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { PostgresAuthSessionRepository } = require('../src/repositories/postgresAuthSessionRepository');
async function main() {
  const url = new URL(getConfig({ requireDiscord: false }).database.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Teste requer PostgreSQL local.');
  const database = createDatabase(url.toString()); const name = `cyl_auth_test_${randomBytes(8).toString('hex')}`;
  let connection; let created = false;
  try {
    connection = await database.pool.connect();
    await connection.query(`create schema ${name}`); created = true;
    await connection.query(`set search_path to ${name}`);
    await connection.query(await readFile(path.join(__dirname, '../src/database/migrations/0012_auth_sessions.sql'), 'utf8'));
    const key = randomBytes(32).toString('hex');
    const store = () => new AuthSessionManager({ repository: new PostgresAuthSessionRepository({ pool: connection }, key) });
    const manager = store(); const session = await manager.create({ id: '1548161474227077212', username: 'test' }, { access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600 });
    const restarted = store(); assert.equal((await restarted.authenticate(session.id)).user.id, session.user.id);
    const rows = await connection.query('select * from auth_sessions');
    assert.equal(rows.rows[0].session_hash.includes(session.id), false); assert.equal(rows.rows[0].credentials.includes('fake-access'), false);
    await restarted.remove(session.id); assert.equal(await manager.authenticate(session.id), null);
    console.log('PostgreSQL temporário: migrations, restart, criptografia e logout passaram.');
  } finally { if (connection) { if (created) await connection.query(`drop schema ${name} cascade`); connection.release(); } await database.close(); }
}
main().catch(error => { let cause = error; while (cause.cause) cause = cause.cause; console.error(`Falha no teste PostgreSQL temporário: ${/^[A-Z0-9_]+$/.test(cause.code || '') ? cause.code : cause.name}.`); process.exitCode = 1; });
