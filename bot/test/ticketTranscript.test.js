require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ticketFixture, ids } = require('./helpers/ticketFixture');
const { TicketTranscriptService, safeAttachmentUrl } = require('../src/services/ticketTranscriptService');

test('transcript pagina todas as mensagens, ordena e escapa HTML, embeds, nomes e anexos', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  ticket.closing = { startedAt: f.now(), reason: '<img src=x onerror=alert(1)>', summary: '' };
  const messages = Array.from({ length: 205 }, (_, index) => ({ id: String(100000000000000000n + BigInt(index)),
    authorId: ids.user, authorName: '<script>autor</script>', createdAt: new Date(f.now()).toISOString(),
    content: `Mensagem ${index}`, embeds: ['<iframe>'], attachments: index ? [] : [
      { name: 'seguro".txt', size: 1, url: 'https://cdn.discordapp.com/attachments/123/file.txt?sig=test' },
      { name: 'inseguro', size: 1, url: 'javascript:alert(1)' },
    ] }));
  f.channels.get(ticket.channelId).messages = messages;
  const reference = await f.transcripts.generate(ticket);
  assert.equal(reference.messageCount, 205);
  assert.equal(reference.lastMessageId, messages.at(-1).id);
  assert.equal(f.calls.filter(call => call === 'messages').length, 3);
  const html = f.transcripts.read(reference).toString();
  assert(html.indexOf('Mensagem 0') < html.indexOf('Mensagem 204'));
  assert(!html.includes('<script>')); assert(!html.includes('<iframe>')); assert(!html.includes('href="javascript:'));
  assert(html.includes('&lt;img')); assert(html.includes('Content-Security-Policy'));
  assert(html.includes('https://cdn.discordapp.com/attachments/123/file.txt?sig=test'));
  assert(html.includes(`(${ids.user})`));
});

test('limites de tamanho/mensagens falham sem truncar nem apagar canal; paginação repetida é rejeitada', async t => {
  const f = ticketFixture(t); const ticket = await f.create(); ticket.closing = { startedAt: f.now(), reason: 'Fim', summary: '' };
  for (const options of [{ maxMessages: 0 }, { maxBytes: 1 }]) {
    const service = new TicketTranscriptService({ adapter: f.adapter, repository: f.transcriptRepository, ...options });
    await assert.rejects(service.generate(ticket), /limite/);
  }
  const message = f.channels.get(ticket.channelId).messages[0];
  f.adapter.fetchMessages = async () => Array(100).fill(message);
  await assert.rejects(f.transcripts.generate(ticket), /Paginação inconsistente/);
  assert(f.channels.has(ticket.channelId));
});

test('URLs de anexos restringem protocolo/host e repository impede traversal e detecta corrupção', async t => {
  for (const url of ['file:///etc/passwd', 'https://attacker.example/x', 'https://cdn.discordapp.com.attacker.example/x', 'https://user:pass@cdn.discordapp.com/x', 'data:text/html,test']) assert.equal(safeAttachmentUrl(url), null);
  const f = ticketFixture(t); const ticket = await f.close(await f.create());
  assert.throws(() => f.transcriptRepository.read('../tickets.json'), /inválida/);
  fs.writeFileSync(f.transcriptRepository.file(ticket.closing.transcript.key), 'alterado');
  assert.throws(() => f.transcripts.read(ticket.closing.transcript), /inconsistente/);
});

test('repository não sobrescreve JSON inválido e falha de rename preserva tickets anteriores', async t => {
  const f = ticketFixture(t); await f.create();
  const file = f.repository.store.file;
  const before = fs.readFileSync(file, 'utf8');
  t.mock.method(fs, 'renameSync', () => { throw new Error('Falha de rename'); });
  const ticket = f.repository.list(ids.guild)[0]; ticket.subject = 'Mudança';
  assert.throws(() => f.repository.save(ticket), /rename/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  fs.writeFileSync(file, '{invalid');
  assert.throws(() => f.repository.list(ids.guild));
  assert.throws(() => f.repository.save(ticket));
  assert.equal(fs.readFileSync(file, 'utf8'), '{invalid');
});

test('nova captura não sobrescreve versão anterior referenciada por um checkpoint', async t => {
  const f = ticketFixture(t); const ticket = await f.create();
  ticket.closing = { startedAt: f.now(), reason: 'Fim', summary: '' };
  const previous = await f.transcripts.generate(ticket);
  const oldBytes = f.transcripts.read(previous);
  f.channels.get(ticket.channelId).messages.push({ id: '100000000000000002', authorId: ids.user, authorName: 'User', createdAt: new Date(f.now()).toISOString(), content: 'Nova mensagem' });
  const next = await f.transcripts.generate(ticket);
  assert.notEqual(previous.key, next.key);
  assert.deepEqual(f.transcripts.read(previous), oldBytes);
  assert(f.transcripts.read(next).toString().includes('Nova mensagem'));
});
