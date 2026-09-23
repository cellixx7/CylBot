const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Escritas síncronas + rename: um processo. Não substitui transações entre processos.
class TicketJsonStore {
  constructor(file) { this.file = file; }
  read() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Armazenamento de tickets inválido.');
      return data;
    } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  write(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, this.file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
}
module.exports = { TicketJsonStore };
