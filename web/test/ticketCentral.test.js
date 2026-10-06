import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { emptyFilters, filterQuery, filterChips } from '../src/tickets/ticketFilterView.js';
import { conversationDay, isGroupedWithPrevious } from '../src/tickets/conversationPresentation.js';
import { ticketConversationMode } from '../src/tickets/messageReconciliation.js';
import { getTickets, getTicketTools, runTicketTool } from '../src/tickets/ticketsApi.js';

test('datas usam início/fim reais e presets incluem hoje; chips usam categorias/responsáveis reais', () => {
  const now = new Date(2026, 9, 6, 14, 32);
  for (const [period, firstDay] of [['today', 6], ['week', 30], ['month30', 7], ['month', 1]]) {
    const query = filterQuery({ ...emptyFilters, period }, now);
    assert.equal(new Date(query.from).getDate(), firstDay); assert.equal(new Date(query.from).getHours(), 0);
    assert.equal(new Date(query.to).getHours(), 23); assert.equal(new Date(query.to).getMilliseconds(), 999);
  }
  const filters = { ...emptyFilters, status: 'CONCLUDED', category: 'support', assigned: 'me', period: 'custom', from: '2026-10-01', to: '2026-10-06' };
  const query = filterQuery(filters);
  assert.equal(query.status, 'CONCLUDED'); assert.equal(query.assigned, 'me'); assert.equal(query.category, 'support');
  assert.equal(new Date(query.to).getDate(), 6);
  assert.equal(filterChips(filters, [{ id: 'support', name: 'Ajuda real' }], [], { CONCLUDED: 'Concluído' }).length, 4);
  assert.match(filterChips(filters, [{ id: 'support', name: 'Ajuda real' }])[1].label, /Ajuda real/);
});
test('separadores de data e finalizados preservam history e impedem agrupamento entre dias', () => {
  const now = new Date(2026, 9, 6, 14);
  assert.equal(conversationDay(new Date(2026, 9, 6), now), 'Hoje');
  assert.equal(conversationDay(new Date(2026, 9, 5), now), 'Ontem');
  assert.match(conversationDay(new Date(2026, 9, 4), now), /04 de outubro de 2026/);
  assert.equal(ticketConversationMode('CONCLUDED'), 'history');
  const message = { authorType: 'STAFF', authorName: 'Ana', isOwn: true };
  assert.equal(isGroupedWithPrevious({ ...message, createdAt: new Date(2026, 9, 6, 0, 1) }, { ...message, createdAt: new Date(2026, 9, 5, 23, 59) }), false);
});
test('listagem envia filtros junto do cursor e ferramenta só recebe parâmetros contextualizados', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return new Response('{}', { status: 200 }); });
  await getTickets('guild', 428, undefined, { status: 'CONCLUDED', category: 'support', assigned: 'me', search: '#428' });
  const query = new URL(calls[0].url, 'http://localhost').searchParams;
  assert.equal(query.get('before'), '428'); assert.equal(query.get('search'), '#428'); assert.equal(query.get('status'), 'CONCLUDED');
  await getTicketTools('guild', 'ticket');
  assert.match(calls[1].url, /ticket\/tools\?guildId=guild/);
  await runTicketTool('guild', 'ticket', 'timeout', { durationMs: 300000, reason: 'Motivo', confirm: true });
  assert.deepEqual(JSON.parse(calls[2].options.body), { guildId: 'guild', durationMs: 300000, reason: 'Motivo', confirm: true });
});
test('componentes renderizam fila selecionada, stats reais, chips, loading/stale, links e anexos seguros', async () => {
  const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' });
  const render = (component, props) => renderToStaticMarkup(createElement(component, props));
  try {
    const { default: Queue } = await vite.ssrLoadModule('/src/tickets/TicketQueue.jsx');
    const { default: Stats } = await vite.ssrLoadModule('/src/tickets/TicketStatusSummary.jsx');
    const { default: Content } = await vite.ssrLoadModule('/src/tickets/MessageContent.jsx');
    const { default: Attachments } = await vite.ssrLoadModule('/src/tickets/MessageAttachments.jsx');
    const { default: Filters } = await vite.ssrLoadModule('/src/tickets/TicketFilters.jsx');
    const { default: Page } = await vite.ssrLoadModule('/src/tickets/TicketsPage.jsx');
    assert.match(render(Page, { guildId: 'guild', requireRelogin() {} }), /Selecione um ticket para visualizar a conversa/);
    assert.match(render(Page, { guildId: 'guild', ticketId: 'ticket', requireRelogin() {} }), /has-selection/);
    const queue = render(Queue, { guildId: 'guild', selectedId: 'ticket', state: { error: 'Falha temporária', retry() {}, data: { tickets: [{ id: 'ticket', publicNumber: 428, subject: 'Ajuda', status: 'CONCLUDED', categoryName: 'Suporte', creatorName: 'Ana', createdAt: Date.now() }], nextBefore: 420 } }, cursors: [null], setCursors() {} });
    assert.match(queue, /aria-current="page"/); assert.match(queue, /Concluído/); assert.match(queue, /última leitura válida/); assert.match(queue, /Tickets anteriores/);
    assert.match(render(Stats, { stats: { open: 18, closed: 4, concluded: 126 } }), /126/); assert.match(render(Stats, {}), /—/);
    const links = render(Content, { content: '<script> https://example.com/doc. javascript:alert(1) https://user:secret@example.com' });
    assert.match(links, /&lt;script&gt;/); assert.match(links, /href="https:\/\/example.com\/doc"/); assert.doesNotMatch(links, /href="javascript|href="https:\/\/user/); assert.match(links, /noopener noreferrer/);
    const files = render(Attachments, { attachments: [{ name: 'foto.png', contentType: 'image/png', size: 2048, url: 'https://cdn.discordapp.com/attachments/a.png' }, { name: '<script>.pdf', url: 'https://media.discordapp.net/attachments/a.pdf' }, { name: 'unsafe', url: 'https://evil.test/file' }] });
    assert.match(files, /loading="lazy"/); assert.match(files, /&lt;script&gt;.pdf/); assert.doesNotMatch(files, /evil.test/);
    assert.match(render(Filters, { filters: { ...emptyFilters, status: 'CONCLUDED' }, categories: [], assignees: [], onChange() {} }), /Remover Status: Concluído/);
  } finally { await vite.close(); }
});
