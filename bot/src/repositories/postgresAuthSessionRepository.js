const { createHash, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');

class PostgresAuthSessionRepository {
  constructor(database, key) {
    this.pool = database.pool;
    if (!/^[a-f0-9]{64}$/i.test(key || '')) throw new Error('AUTH_SESSION_ENCRYPTION_KEY deve conter 32 bytes em hexadecimal.');
    this.key = Buffer.from(key, 'hex');
  }
  hash(id) { return createHash('sha256').update(id).digest('hex'); }
  encrypt(session) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(this.hash(session.id)));
    const { id, ...value } = session;
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }
  decrypt(id, value) {
    const data = Buffer.from(value, 'base64'); const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    decipher.setAAD(Buffer.from(this.hash(id))); decipher.setAuthTag(data.subarray(12, 28));
    return { ...JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')), id };
  }
  async create(session) { await this.pool.query('insert into auth_sessions (session_hash,user_id,credentials,expires_at) values ($1,$2,$3,$4)', [this.hash(session.id), session.user.id, this.encrypt(session), new Date(session.expiresAt)]); }
  async get(id) { const { rows } = await this.pool.query('select credentials from auth_sessions where session_hash=$1', [this.hash(id)]); return rows[0] ? this.decrypt(id, rows[0].credentials) : null; }
  async save(session) { const result = await this.pool.query('update auth_sessions set credentials=$2 where session_hash=$1 and expires_at > now()', [this.hash(session.id), this.encrypt(session)]); return result.rowCount > 0; }
  async remove(id) { if (id) await this.pool.query('delete from auth_sessions where session_hash=$1', [this.hash(id)]); }
  async cleanup() { await this.pool.query('delete from auth_sessions where expires_at <= now()'); }
}
module.exports = { PostgresAuthSessionRepository };
