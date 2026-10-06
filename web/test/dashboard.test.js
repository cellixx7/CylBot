import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('dashboard mantém ações autorizadas na expansão e omite métricas inexistentes', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom',
  });
  try {
    const { default: GuildCard } = await server.ssrLoadModule('/src/dashboard/GuildCard.jsx');
    const guild = { id: '1546366426216931401', name: 'Support Lab', botInstalled: true,
      canManage: false, canViewTickets: true, memberCount: 1204,
      botPermissions: { state: 'limited' }, ticketing: { enabled: true, total: 24, open: 6, closed: 18 } };
    const render = props => renderToStaticMarkup(createElement(GuildCard, { guild, ...props }));

    for (const variant of ['card', 'list']) {
      const closed = render({ variant });
      assert.doesNotMatch(closed, /Gerenciar servidor|Acompanhar tickets/);
      assert.match(closed, /aria-label="Opções de Support Lab"/);
      assert.match(closed, /aria-expanded="false"/);
      const expanded = render({ variant, expanded: true });
      assert.match(expanded, /Acompanhar tickets/);
      assert.match(expanded, /#\/dashboard\/1546366426216931401\/tickets/);
      assert.doesNotMatch(expanded, /Gerenciar servidor/);
      assert.match(expanded, /Limitadas/);
    }
    assert.match(render({ expanded: true, guild: { ...guild, canManage: true } }), /Gerenciar servidor/);
    assert.doesNotMatch(render({ expanded: true, guild: { ...guild, canViewTickets: false } }), /Acompanhar tickets/);

    const available = { ...guild, botInstalled: false, canAddBot: true, memberCount: null, ticketing: null };
    for (const variant of ['card', 'list']) {
      for (const expanded of [false, true]) {
        const markup = render({ guild: available, variant, expanded });
        assert.match(markup, /Adicionar CYL/);
        assert.doesNotMatch(markup, /membros|Membros|Tickets totais|Tickets não configurados|Gerenciar servidor/);
      }
      assert.doesNotMatch(render({ guild: { ...available, canAddBot: false }, variant }), /href="https:\/\/discord.com\/oauth2\/authorize/);
    }
    const unknownMetrics = render({ guild: { ...guild, memberCount: null, ticketing: { enabled: false } } });
    assert.doesNotMatch(unknownMetrics, /— membros|tickets abertos|Tickets não configurados/);
    assert.match(render({ guild: { ...guild, memberCount: 0, ticketing: { enabled: true, open: 0 } } }), /0 membros/);
  } finally {
    await server.close();
  }
});
