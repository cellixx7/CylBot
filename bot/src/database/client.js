const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const schema = require('./schema');

function createDatabase(url) {
  if (!url) return null;
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    async close() { await pool.end(); },
    async ping() { await pool.query('select 1'); },
  };
}

module.exports = { createDatabase };
