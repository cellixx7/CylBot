const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const KEY = new RegExp(`^${UUID}-\\d+-${UUID}\\.html$`);
class TicketTranscriptRepository {
  // Preserve o caminho legado: referências persistidas armazenam apenas a chave.
  constructor(directory = path.join(__dirname, '../../data/ticket-transcripts')) { this.directory = path.resolve(directory); }
  file(key) {
    if (typeof key !== 'string' || !KEY.test(key)) throw new Error('Referência de transcrição inválida.');
    return path.join(this.directory, key);
  }
  checkDirectory() {
    const stat = fs.lstatSync(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Diretório de transcrições inválido.');
  }
  save(ticket, html) {
    // Versão imutável: falha ao salvar a referência JSON não invalida a captura anterior.
    const key = `${ticket.id}-${ticket.reopenCount}-${randomUUID()}.html`;
    const file = this.file(key);
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.checkDirectory();
    const temporary = `${file}.${randomUUID()}.tmp`;
    let descriptor;
    let ownsTemporary = false;
    try {
      descriptor = fs.openSync(temporary, 'wx', 0o600);
      ownsTemporary = true;
      fs.writeFileSync(descriptor, html, { encoding: 'utf8' });
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      // Publicação atômica sem sobrescrita, mesmo numa colisão de chave.
      // NTFS/POSIX: link falha com EEXIST; rename poderia substituir a captura.
      fs.linkSync(temporary, file);
    } finally {
      try { if (descriptor !== undefined) fs.closeSync(descriptor); }
      finally { if (ownsTemporary) fs.unlinkSync(temporary); }
    }
    return key;
  }
  read(key) {
    const file = this.file(key);
    this.checkDirectory();
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Arquivo de transcrição inválido.');
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const opened = fs.fstatSync(descriptor);
      if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== stat.dev || opened.ino !== stat.ino) {
        throw new Error('Arquivo de transcrição inválido.');
      }
      return fs.readFileSync(descriptor);
    } finally { fs.closeSync(descriptor); }
  }
}
module.exports = { TicketTranscriptRepository };
