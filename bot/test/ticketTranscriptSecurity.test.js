require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { spawnSync } = require('node:child_process');
const { ticketFixture, ids } = require('./helpers/ticketFixture');
const { tempDirectory } = require('./helpers/tempDirectory');
const { TicketTranscriptRepository } = require('../src/Ticket/repositories/ticketTranscriptRepository');
const { TicketTranscriptService, safeAttachmentUrl } = require('../src/Ticket/services/ticketTranscriptService');
const { logger } = require('../src/lib/logger');
const { createRequestHandler } = require('../src/api/server');

// Somente dados fabricados. Nunca ler HTMLs de runtime como fixtures.
const syntheticHtml = '<!doctype html><html lang="pt-BR"><title>Teste sintético</title><p>Exemplo</p></html>';
function storage(t) {
  const root = tempDirectory(t, 'cylbot-transcript-security-');
  const repository = new TicketTranscriptRepository(path.join(root, 'transcripts'));
  return { root, repository, ticket: { id: randomUUID(), reopenCount: 0 } };
}

test('escapa também título, metadados, textos e atributos sem copiar campos extras', async t => {
  const f = ticketFixture(t);
  const ticket = await f.create();
  const attack = '</title><script>alert("fixture")</script>&\'';
  const escaped = '&lt;/title&gt;&lt;script&gt;alert(&quot;fixture&quot;)&lt;/script&gt;&amp;&#39;';
  Object.assign(ticket, { sequence: attack, guildName: attack, categoryName: attack,
    creatorName: attack, assignedName: attack, subject: attack, description: attack,
    privateToken: 'SYNTHETIC_TICKET_SECRET',
    closing: { startedAt: f.now(), reason: attack, summary: attack } });
  f.channels.get(ticket.channelId).messages = [{ id: '100000000000000001', authorId: ids.user,
    authorName: attack, content: attack, createdAt: new Date(f.now()).toISOString(), embeds: [attack],
    privateToken: 'SYNTHETIC_SDK_SECRET', attachments: [{ name: attack, size: attack,
      url: 'https://cdn.discordapp.com/attachments/123/test.txt?first=1&second=2' }] }];
  const logs = [];
  t.mock.method(logger, 'info', (event, context) => logs.push({ event, ...context }));
  const reference = await f.transcripts.generate(ticket);
  const html = f.transcripts.read(reference).toString('utf8');
  assert(html.startsWith('<!doctype html><html lang="pt-BR">'));
  assert(html.endsWith('</html>'));
  assert(html.includes(`<title>Ticket #${escaped}</title>`));
  assert(html.includes(`<h1>Ticket #${escaped}</h1>`));
  assert(html.includes(`>${escaped}</a> (${escaped} bytes)`));
  assert(html.includes('first=1&amp;second=2'));
  assert(html.includes('rel="noreferrer noopener"'));
  assert(html.includes('name="referrer" content="no-referrer"'));
  assert(html.includes("default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"));
  assert.doesNotMatch(html, /<script|SYNTHETIC_TICKET_SECRET|SYNTHETIC_SDK_SECRET/i);
  assert.equal(Object.keys(reference).sort().join(','), 'key,lastMessageId,messageCount,sha256,source');
  assert.deepEqual(logs, [{ event: 'ticket.transcript.generated', guildId: ids.guild,
    ticketId: ticket.id, channelId: ticket.channelId, messageCount: 1 }]);
});

test('links aceitam somente HTTPS e hosts CDN exatos, sem credenciais ou portas alternativas', () => {
  for (const value of [null, {}, '', 'javascript:alert(1)', 'data:text/html,fixture', 'file:///fixture',
    '//cdn.discordapp.com/a', 'http://cdn.discordapp.com/a', 'https://cdn.discordapp.com:8443/a',
    'https://cdn.discordapp.com.evil.example/a', 'https://evil.example/?host=cdn.discordapp.com',
    'https://cdn.discordapp.com@evil.example/a', 'https://user@cdn.discordapp.com/a',
    'https://user:pass@media.discordapp.net/a', 'https://cdn.discordapp.com./a',
    'https://cdn.discordapp.com\\@evil.example/a', 'https://cdn.disco\nrdapp.com/a',
    ' https://cdn.discordapp.com/a', 'https://cdn.discordapp.com/a\u0000']) {
    assert.equal(safeAttachmentUrl(value), null);
  }
  for (const host of ['cdn.discordapp.com', 'media.discordapp.net']) {
    const url = `https://${host}/attachments/123/456/fixture.txt?ex=abc&is=def&hm=synthetic`;
    assert.equal(safeAttachmentUrl(url), url, 'Preservar os parâmetros do link assinado');
    assert.equal(safeAttachmentUrl(`https://${host}:443/a`), `https://${host}/a`);
  }
});

test('rejeita traversal, caminhos absolutos, ADS e chaves malformadas sem tocar no disco', t => {
  const { repository, ticket } = storage(t);
  const key = `${ticket.id}-0-${randomUUID()}.html`;
  for (const value of ['../outside.html', '..\\outside.html', `/tmp/${key}`, `C:\\temp\\${key}`,
    `${key}:stream`, `${key}/extra`, `${key}\u0000`, `${'-'.repeat(36)}-0-${'-'.repeat(36)}.html`,
    null, {}, ['../outside.html']]) {
    assert.throws(() => repository.read(value), /Referência de transcrição inválida/);
  }
  assert.throws(() => repository.save({ ...ticket, id: '../outside' }, syntheticHtml), /inválida/);
  assert.throws(() => repository.save({ ...ticket, reopenCount: -1 }, syntheticHtml), /inválida/);
  assert.equal(fs.existsSync(repository.directory), false);
});

test('arquivos são privados, imutáveis e preservados após reinício e passagem do tempo', t => {
  const { repository, ticket } = storage(t);
  const modes = [];
  const open = fs.openSync;
  const mkdir = fs.mkdirSync;
  t.mock.method(fs, 'mkdirSync', (file, options) => { modes.push(options.mode); return mkdir(file, options); });
  t.mock.method(fs, 'openSync', (file, flags, mode) => { if (flags === 'wx') modes.push(mode); return open(file, flags, mode); });
  const key = repository.save(ticket, syntheticHtml);
  const old = new Date('2000-01-01T00:00:00Z');
  fs.utimesSync(repository.file(key), old, old);
  const restarted = new TicketTranscriptRepository(repository.directory);
  const next = restarted.save(ticket, syntheticHtml + '<!-- segunda captura sintética -->');
  assert.notEqual(key, next);
  assert.equal(restarted.read(key).toString(), syntheticHtml);
  assert.equal(fs.readdirSync(repository.directory).length, 2);
  assert(modes.includes(0o700)); assert(modes.includes(0o600));
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(repository.directory).mode & 0o077, 0);
    assert.equal(fs.statSync(repository.file(key)).mode & 0o077, 0);
  }
});

test('colisão na publicação nunca sobrescreve outro arquivo e remove apenas seu temporário', t => {
  const { repository, ticket } = storage(t);
  const link = fs.linkSync;
  let destination;
  t.mock.method(fs, 'linkSync', (temporary, file) => {
    destination = file;
    fs.writeFileSync(file, 'captura sintética existente', { flag: 'wx' });
    return link(temporary, file);
  });
  assert.throws(() => repository.save(ticket, syntheticHtml), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(destination, 'utf8'), 'captura sintética existente');
  assert.deepEqual(fs.readdirSync(repository.directory), [path.basename(destination)]);
});

test('colisão do temporário não apaga nem altera um arquivo que esta operação não criou', t => {
  const { repository, ticket } = storage(t);
  const open = fs.openSync;
  let collision;
  t.mock.method(fs, 'openSync', (file, flags, mode) => {
    if (flags === 'wx' && file.endsWith('.tmp')) {
      collision = file;
      const descriptor = open(file, 'wx', mode);
      try { fs.writeFileSync(descriptor, 'temporário sintético alheio'); }
      finally { fs.closeSync(descriptor); }
    }
    return open(file, flags, mode);
  });
  assert.throws(() => repository.save(ticket, syntheticHtml), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(collision, 'utf8'), 'temporário sintético alheio');
  assert.deepEqual(fs.readdirSync(repository.directory), [path.basename(collision)]);
});

for (const stage of ['writeFileSync', 'fsyncSync', 'linkSync']) {
  test(`falha de ${stage} limpa o temporário e preserva capturas anteriores`, t => {
    const { repository, ticket } = storage(t);
    const key = repository.save(ticket, syntheticHtml);
    const write = fs.writeFileSync;
    t.mock.method(fs, stage, (...args) => {
      if (stage === 'writeFileSync') write(args[0], 'fragmento sintético');
      throw Object.assign(new Error('Falha simulada'), { code: 'EIO' });
    });
    assert.throws(() => repository.save(ticket, syntheticHtml), { code: 'EIO' });
    assert.deepEqual(fs.readdirSync(repository.directory), [key]);
    assert.equal(repository.read(key).toString(), syntheticHtml);
  });
}

test('rejeita diretório de armazenamento redirecionado por symlink/junction', t => {
  const { root, repository, ticket } = storage(t);
  const outside = path.join(root, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, repository.directory, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => repository.save(ticket, syntheticHtml), /Diretório de transcrições inválido/);
  assert.equal(fs.readdirSync(outside).length, 0);
});

test('rejeita hardlink e arquivos não regulares na leitura', t => {
  const { root, repository, ticket } = storage(t);
  const key = repository.save(ticket, syntheticHtml);
  fs.linkSync(repository.file(key), path.join(root, 'outside.html'));
  assert.throws(() => repository.read(key), /Arquivo de transcrição inválido/);
  const directoryKey = `${ticket.id}-0-${randomUUID()}.html`;
  fs.mkdirSync(repository.file(directoryKey));
  assert.throws(() => repository.read(directoryKey), /Arquivo de transcrição inválido/);
});

test('não segue symlink de arquivo e detecta substituição entre lstat e open', t => {
  const { repository, ticket } = storage(t);
  const key = repository.save(ticket, syntheticHtml);
  const lstat = fs.lstatSync;
  const statMock = t.mock.method(fs, 'lstatSync', file => file === repository.file(key)
    ? { isFile: () => true, isSymbolicLink: () => true } : lstat(file));
  assert.throws(() => repository.read(key), /Arquivo de transcrição inválido/);
  statMock.mock.restore();
  const fstat = fs.fstatSync;
  t.mock.method(fs, 'fstatSync', fd => ({ ...fstat(fd), isFile: () => true, ino: -1 }));
  assert.throws(() => repository.read(key), /Arquivo de transcrição inválido/);
});

test('falha no checkpoint Discord não deixa arquivo órfão nem log de geração bem-sucedida', async t => {
  const f = ticketFixture(t);
  const ticket = await f.create(); ticket.closing = { startedAt: f.now(), reason: 'Teste sintético' };
  const logs = [];
  t.mock.method(logger, 'info', (...args) => logs.push(args));
  t.mock.method(f.adapter, 'latestMessageId', async () => { throw new Error('Falha simulada'); });
  const service = new TicketTranscriptService({ adapter: f.adapter, repository: f.transcriptRepository,
    messages: { repository: {}, forTranscript: async () => [{ id: randomUUID(), createdAt: f.now(),
      authorDiscordId: ids.user, authorName: 'Pessoa fictícia', content: 'Conversa sintética' }] } });
  await assert.rejects(service.generate(ticket), /Falha simulada/);
  assert.equal(fs.existsSync(f.transcriptRepository.directory), false);
  assert.deepEqual(logs, []);
});

test('falha na limpeza é explícita, não apaga capturas anteriores e permite revisão do resíduo', t => {
  const { repository, ticket } = storage(t);
  const previous = repository.save(ticket, syntheticHtml);
  t.mock.method(fs, 'unlinkSync', () => { throw Object.assign(new Error('Limpeza sem permissão'), { code: 'EACCES' }); });
  assert.throws(() => repository.save(ticket, syntheticHtml), { code: 'EACCES' });
  assert.equal(repository.read(previous).toString(), syntheticHtml);
  const files = fs.readdirSync(repository.directory);
  assert.equal(files.filter(file => file.endsWith('.tmp')).length, 1);
  const unpublished = files.find(file => file.endsWith('.html') && file !== previous);
  assert.throws(() => repository.read(unpublished), /Arquivo de transcrição inválido/);
});

test('remoção do canal e reabertura preservam a captura e seu hash para leitura/download', async t => {
  const f = ticketFixture(t);
  const closed = await f.close(await f.create());
  const reference = structuredClone(closed.closing.transcript);
  const before = f.transcripts.read(reference);
  await f.service.removeChannel(f.logAction(closed));
  assert.deepEqual(f.transcripts.read(reference), before);
  f.advance();
  const reopened = await f.makeService().reopen(f.logAction(closed));
  assert.deepEqual(f.transcripts.read(reopened.archives[0].transcript), before);
  assert.equal(reopened.archives[0].transcript.sha256, reference.sha256);
  assert(f.calls.includes('initialWithTranscript'));
});

test('erro de escrita ao fechar não publica conteúdo sensível nos logs e preserva o canal', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  const logs = [];
  for (const level of ['info', 'warn', 'error']) t.mock.method(logger, level, (event, context) => logs.push({ event, ...context }));
  t.mock.method(f.transcriptRepository, 'save', () => { throw Object.assign(new Error('SYNTHETIC_PRIVATE_CONTENT'), { code: 'EIO' }); });
  await assert.rejects(f.close(ticket), /canal foi preservado/);
  assert.doesNotMatch(JSON.stringify(logs), /SYNTHETIC_PRIVATE_CONTENT|Descrição do atendimento|Orientação enviada/);
  assert.equal(f.logs.size, 0);
  assert(f.channels.has(ticket.channelId));
});

test('API não expõe arquivos de transcript por caminho nem adiciona download público', async () => {
  const handler = createRequestHandler({ services: {} });
  const key = `${randomUUID()}-0-${randomUUID()}.html`;
  for (const url of [`/data/ticket-transcripts/${key}`, `/src/data/ticket-transcripts/${key}`, `/ticket-transcripts/${key}`]) {
    const request = Object.assign(Readable.from([]), { method: 'GET', url, headers: {} });
    const response = { setHeader() {}, writeHead(status) { this.status = status; return this; }, end(body) { this.body = body; } };
    await handler(request, response);
    assert.equal(response.status, 404);
    assert.doesNotMatch(response.body, /<!doctype|<html/i);
  }
});

test('git ignora HTMLs e temporários de runtime sem ocultar testes ou código', () => {
  const root = path.resolve(__dirname, '../..');
  const result = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: root, encoding: 'utf8',
    input: ['bot/src/data/ticket-transcripts/synthetic.html', 'bot/src/data/ticket-transcripts/synthetic.html.tmp',
      'bot/test/ticketTranscriptSecurity.test.js', 'bot/src/Ticket/services/ticketTranscriptService.js'].join('\n') + '\n' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), [
    'bot/src/data/ticket-transcripts/synthetic.html', 'bot/src/data/ticket-transcripts/synthetic.html.tmp']);
});
