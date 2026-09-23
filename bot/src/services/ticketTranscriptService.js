const { clientError } = require('../api/http/errors');
const { logger } = require('../lib/logger');
const { ticketNumber } = require('./ticketConstants');
const { createHash } = require('node:crypto');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function safeAttachmentUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) return url.href;
  } catch {}
  return null;
}
class TicketTranscriptService {
  constructor({ adapter, repository, maxMessages = 5000, maxBytes = 7 * 1024 * 1024 }) {
    Object.assign(this, { adapter, repository, maxMessages, maxBytes });
  }
  async generate(ticket) {
    const messages = [];
    let before;
    let bytes = 0;
    const seen = new Set();
    while (true) {
      const page = await this.adapter.fetchMessages(ticket.guildId, ticket.channelId, { before, limit: 100 });
      if (!page.length) break;
      for (const message of page) {
        if (seen.has(message.id)) throw clientError(503, 'Paginação inconsistente; o canal foi preservado.');
        seen.add(message.id);
        bytes += Buffer.byteLength(JSON.stringify(message));
        if (messages.length >= this.maxMessages || bytes > this.maxBytes) throw clientError(400, 'Transcrição excede o limite seguro do MVP; o canal foi preservado.');
        messages.push(message);
      }
      before = page.reduce((oldest, message) => BigInt(message.id) < BigInt(oldest) ? message.id : oldest, page[0].id);
      if (page.length < 100) break;
    }
    messages.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
    const closure = ticket.closing;
    const rows = messages.map(message => `<article><h3>${escape(message.authorName)} (${escape(message.authorId)})</h3><time>${escape(message.createdAt)}</time><pre>${escape(message.content)}</pre>${(message.embeds || []).map(embed => `<pre>${escape(embed)}</pre>`).join('')}${(message.attachments || []).map(attachment => {
      const url = safeAttachmentUrl(attachment.url);
      return url ? `<p><a rel="noreferrer noopener" href="${escape(url)}">${escape(attachment.name)}</a> (${escape(attachment.size)} bytes)</p>` : `<p>Anexo: ${escape(attachment.name)} (link indisponível)</p>`;
    }).join('')}</article>`).join('\n');
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Ticket #${ticketNumber(ticket)}</title><style>body{max-width:960px;margin:2rem auto;padding:1rem;font:16px system-ui;background:#f4f5f7;color:#20232a}article{background:white;padding:1rem;margin:1rem 0;border:1px solid #ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}time{color:#555}</style><h1>Ticket #${ticketNumber(ticket)}</h1><pre>${escape([
      `ID: ${ticket.id}`, `Servidor: ${ticket.guildName} (${ticket.guildId})`, `Categoria: ${ticket.categoryName}`,
      `Criador: ${ticket.creatorName} (${ticket.creatorUserId})`, `Atendente: ${ticket.assignedName || 'Nenhum'} (${ticket.assignedUserId || '—'})`,
      `Criado: ${new Date(ticket.createdAt).toISOString()}`, `Assumido: ${ticket.claimedAt ? new Date(ticket.claimedAt).toISOString() : '—'}`,
      `Encerramento solicitado: ${new Date(closure.startedAt).toISOString()}`, `Ciclo: ${ticket.reopenCount}`,
      `Assunto: ${ticket.subject}`, `Descrição: ${ticket.description}`, `Motivo: ${closure.reason}`, `Resumo: ${closure.summary || '—'}`,
    ].join('\n'))}</pre>${rows}<footer>Captura das mensagens disponíveis neste canal. Mensagens apagadas não são recuperáveis. Links de anexos podem expirar.</footer></html>`;
    if (Buffer.byteLength(html) > this.maxBytes) throw clientError(400, 'Transcrição excede o limite de arquivo; o canal foi preservado.');
    const key = this.repository.save(ticket, html);
    logger.info('ticket.transcript.generated', { guildId: ticket.guildId, ticketId: ticket.id, channelId: ticket.channelId, messageCount: messages.length });
    return { key, sha256: createHash('sha256').update(html).digest('hex'), lastMessageId: messages.at(-1)?.id || null, messageCount: messages.length };
  }
  read(reference) {
    const data = this.repository.read(reference.key);
    if (createHash('sha256').update(data).digest('hex') !== reference.sha256) throw clientError(503, 'Transcrição local inconsistente; o canal foi preservado.');
    return data;
  }
}
module.exports = { TicketTranscriptService, safeAttachmentUrl };
