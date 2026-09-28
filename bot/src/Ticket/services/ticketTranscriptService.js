const { clientError } = require('../../api/http/errors');
const { logger } = require('../../lib/logger');
const { ticketNumber } = require('./ticketConstants');
const { createHash } = require('node:crypto');

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function safeAttachmentUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) return url.href;
  } catch {}
  return null;
}

const iso = value => new Date(value).toISOString();
const mapStoredMessage = message => ({
  id: message.discordMessageId || message.id,
  discordMessageId: message.discordMessageId,
  authorId: message.authorDiscordId || message.authorType,
  authorName: message.authorName,
  createdAt: iso(message.createdAt),
  content: message.content,
  embeds: [],
  attachments: [],
});

class TicketTranscriptService {
  constructor({ adapter, repository, messages = null, maxMessages = 5000, maxBytes = 7 * 1024 * 1024 }) {
    Object.assign(this, { adapter, repository, messages, maxMessages, maxBytes });
  }

  async canonicalMessages(ticket) {
    if (!this.messages?.repository) return null;
    const stored = await this.messages.forTranscript(ticket, this.maxMessages);
    if (stored.length > this.maxMessages) throw clientError(400, 'Transcrição excede o limite seguro; o canal foi preservado.');
    const messages = stored.map(mapStoredMessage);
    const bytes = Buffer.byteLength(JSON.stringify(messages));
    if (bytes > this.maxBytes) throw clientError(400, 'Transcrição excede o limite seguro; o canal foi preservado.');
    return messages.length ? messages : null;
  }

  async legacyMessages(ticket) {
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
    return messages;
  }

  render(ticket, messages, canonical) {
    const closure = ticket.closing || {};
    const rows = messages.map(message => `<article><h3>${escape(message.authorName)} (${escape(message.authorId)})</h3><time>${escape(message.createdAt)}</time><pre>${escape(message.content)}</pre>${(message.embeds || []).map(embed => `<pre>${escape(embed)}</pre>`).join('')}${(message.attachments || []).map(attachment => {
      const url = safeAttachmentUrl(attachment.url);
      return url ? `<p><a rel="noreferrer noopener" href="${escape(url)}">${escape(attachment.name)}</a> (${escape(attachment.size)} bytes)</p>` : `<p>Anexo: ${escape(attachment.name)} (link indisponível)</p>`;
    }).join('')}</article>`).join('\n');
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Ticket #${escape(ticketNumber(ticket))}</title><style>body{max-width:960px;margin:2rem auto;padding:1rem;font:16px system-ui;background:#f4f5f7;color:#20232a}article{background:white;padding:1rem;margin:1rem 0;border:1px solid #ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}time{color:#555}</style><h1>Ticket #${escape(ticketNumber(ticket))}</h1><pre>${escape([
      `ID: ${ticket.id}`, `Servidor: ${ticket.guildName} (${ticket.guildId})`, `Categoria: ${ticket.categoryName}`,
      `Criador: ${ticket.creatorName} (${ticket.creatorUserId})`, `Atendente: ${ticket.assignedName || 'Nenhum'} (${ticket.assignedUserId || '—'})`,
      `Criado: ${iso(ticket.createdAt)}`, `Assumido: ${ticket.claimedAt ? iso(ticket.claimedAt) : '—'}`,
      `Encerramento solicitado: ${iso(closure.startedAt)}`, `Ciclo: ${ticket.reopenCount}`,
      `Assunto: ${ticket.subject}`, `Descrição: ${ticket.description}`, `Motivo: ${closure.reason}`, `Resumo: ${closure.summary || '—'}`,
    ].join('\n'))}</pre>${rows}<footer>${canonical ? 'Conversa canônica persistida pelo CylBot.' : 'Fallback legado: captura das mensagens disponíveis neste canal.'} Mensagens apagadas antes da persistência não são recuperáveis. Links de anexos podem expirar.</footer></html>`;
    if (Buffer.byteLength(html) > this.maxBytes) throw clientError(400, 'Transcrição excede o limite de arquivo; o canal foi preservado.');
    return html;
  }

  snapshot(ticket) {
    return {
      id: ticket.id,
      publicNumber: ticket.publicNumber ?? ticket.sequence,
      guildId: ticket.guildId,
      guildName: ticket.guildName,
      channelId: ticket.channelId,
      creatorUserId: ticket.creatorUserId,
      creatorName: ticket.creatorName,
      assignedUserId: ticket.assignedUserId,
      assignedName: ticket.assignedName,
      categoryName: ticket.categoryName,
      subject: ticket.subject,
      description: ticket.description,
      createdAt: ticket.createdAt,
      claimedAt: ticket.claimedAt,
      reopenCount: ticket.reopenCount || 0,
      cycle: ticket.reopenCount || 0,
      closing: { ...(ticket.closing || {}) },
    };
  }

  async generate(ticket) {
    const canonicalMessages = await this.canonicalMessages(ticket);
    const canonical = Boolean(canonicalMessages);
    const messages = canonical ? canonicalMessages : await this.legacyMessages(ticket);
    const html = this.render(ticket, messages, canonical);
    const lastDiscordMessage = canonical ? await this.adapter.latestMessageId(ticket) : messages.at(-1)?.id;
    const key = this.repository?.save ? this.repository.save(ticket, html) : null;
    const reference = {
      key,
      sha256: createHash('sha256').update(html).digest('hex'),
      lastMessageId: lastDiscordMessage || null,
      messageCount: messages.length,
      source: canonical ? 'MESSAGE_CORE' : 'DISCORD_LEGACY',
    };
    Object.defineProperty(reference, 'snapshot', { value: this.snapshot(ticket), enumerable: false });
    logger.info('ticket.transcript.generated', { guildId: ticket.guildId, ticketId: ticket.id, channelId: ticket.channelId, messageCount: messages.length });
    return reference;
  }

  async regenerate(reference, snapshot = reference?.snapshot) {
    if (!snapshot || reference.source !== 'MESSAGE_CORE' || !this.messages?.repository) {
      throw clientError(503, 'Transcrição local ausente e sem dados canônicos suficientes; o canal foi preservado.');
    }
    const ticket = { ...snapshot, sequence: snapshot.publicNumber, reopenCount: snapshot.cycle, closing: snapshot.closing };
    const stored = await this.messages.forTranscript(ticket, this.maxMessages);
    const messages = stored.map(mapStoredMessage);
    const html = this.render(ticket, messages, true);
    const hash = createHash('sha256').update(html).digest('hex');
    if (hash !== reference.sha256) throw clientError(503, 'Transcrição canônica regenerada não corresponde à captura original; o canal foi preservado.');
    return Buffer.from(html, 'utf8');
  }

  read(reference, snapshot) {
    try {
      if (!this.repository?.read || !reference?.key) return this.regenerate(reference, snapshot);
      const data = this.repository.read(reference.key);
      if (createHash('sha256').update(data).digest('hex') !== reference.sha256) throw clientError(503, 'Transcrição local inconsistente; o canal foi preservado.');
      return data;
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) throw error;
      return this.regenerate(reference, snapshot);
    }
  }
}

module.exports = { TicketTranscriptService, safeAttachmentUrl };
