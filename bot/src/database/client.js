const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const schema = require('./schema');

function createDatabase(url) {
  if (!url) return null;
  // Keep the pool bounded for a single bot instance. TLS/sslmode remains controlled by
  // the provider URL, which keeps local Postgres compatible with hosted Postgres.
  const pool = new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    async close() { await pool.end(); },
    async ping() { await pool.query('select 1'); },
  };
}

module.exports = { createDatabase };
