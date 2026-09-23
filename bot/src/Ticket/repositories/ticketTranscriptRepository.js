const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
class TicketTranscriptRepository {
  constructor(directory = path.join(__dirname, '../../data/ticket-transcripts')) { this.directory = directory; }
  file(key) {
    if (!/^[a-f0-9-]{36}-\d+-[a-f0-9-]{36}\.html$/.test(key)) throw new Error('Referência de transcrição inválida.');
    return path.join(this.directory, key);
  }
  save(ticket, html) {
    // Versão imutável: falha ao salvar a referência JSON não invalida a captura anterior.
    const key = `${ticket.id}-${ticket.reopenCount}-${randomUUID()}.html`;
    const file = this.file(key);
    fs.mkdirSync(this.directory, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, html, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return key;
  }
  read(key) { return fs.readFileSync(this.file(key)); }
}
module.exports = { TicketTranscriptRepository };
