import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { accessibleGuilds, parseServerRoute, serverHref, serverSections, workspaceAccess } from '../src/dashboard/server/workspaceAccess.js';

const admin = { id: '1546366426216931401', name: 'CYL Community', botInstalled: true, canManage: true, canViewTickets: true,
  memberCount: 1204, botPermissions: { state: 'ok' }, ticketing: { enabled: true, total: 24, open: 6, closed: 18 } };
const staff = { ...admin, id: '1546366426216931402', name: 'Support Lab', canManage: false };
const denied = { ...admin, id: '1546366426216931403', name: 'Servidor privado', canManage: false, canViewTickets: false };
const available = { ...admin, id: '1546366426216931404', name: 'Disponível', botInstalled: false, canAddBot: true };
const guilds = [admin, staff, denied, available];
const overview = id => parseServerRoute(`/dashboard/${id}`);

test('workspace exige bot instalado e capability da seção, inclusive na entrada direta', () => {
  assert.equal(workspaceAccess(guilds, overview(admin.id)).status, 'allowed');
  assert.deepEqual(workspaceAccess(guilds, overview(staff.id)), { status: 'redirect', guild: staff, href: `#/dashboard/${staff.id}/tickets` });
  for (const id of [denied.id, available.id, '1546366426216931499', 'invalido']) {
    assert.deepEqual(workspaceAccess(guilds, overview(id)), { status: 'denied' });
  }
  assert.equal(workspaceAccess(guilds, parseServerRoute(`/dashboard/${staff.id}/tickets`)).status, 'allowed');
  const adminWithoutTickets = { ...admin, canViewTickets: false };
  assert.equal(workspaceAccess([adminWithoutTickets], parseServerRoute(`/dashboard/${admin.id}/tickets`)).status, 'denied');
  assert.equal(workspaceAccess(guilds, parseServerRoute(`/dashboard/${admin.id}/settings`)).status, 'unavailable');
});

test('switcher lista somente servidores acessíveis e escolhe o destino permitido', () => {
  assert.deepEqual(accessibleGuilds(guilds), [admin, staff]);
  assert.equal(serverHref(admin), `#/dashboard/${admin.id}`);
  assert.equal(serverHref(staff), `#/dashboard/${staff.id}/tickets`);
  assert.deepEqual(accessibleGuilds([{ ...denied, canManage: 'true' }]), []);
});

test('rotas de Tickets e detalhe continuam compatíveis e seções futuras não ganham telas', () => {
  assert.equal(parseServerRoute('/dashboard'), null);
  assert.equal(parseServerRoute('/profile'), null);
  assert.deepEqual(overview(admin.id), { guildId: admin.id, section: 'overview', ticketId: undefined, supported: true });
  const ticketId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert.deepEqual(parseServerRoute(`/dashboard/${admin.id}/tickets/${ticketId}`), { guildId: admin.id, section: 'tickets', ticketId, supported: true });
  assert.equal(parseServerRoute(`/dashboard/${admin.id}/tickets/invalid`).supported, false);
  assert.deepEqual(parseServerRoute(`/dashboard/${admin.id}/announcements`), { guildId: admin.id, section: 'announcements', ticketId: undefined, supported: true });
  assert.equal(parseServerRoute(`/dashboard/${admin.id}/automation`).supported, false);
  assert.deepEqual(serverSections(staff).map(item => item.id), ['tickets']);
  assert.equal(serverSections(admin).length, 8);
  assert.deepEqual(serverSections(admin).filter(item => item.implemented).map(item => item.id), ['overview', 'tickets', 'announcements']);
  assert.deepEqual(serverSections(denied), []);
});

test('workspace renderiza visão operacional real, navegação autorizada e estados seguros', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' });
  try {
    const { default: ServerWorkspace } = await server.ssrLoadModule('/src/dashboard/server/ServerWorkspace.jsx');
    const { default: ServerOverview } = await server.ssrLoadModule('/src/dashboard/server/ServerOverview.jsx');
    const { default: ServerSidebar } = await server.ssrLoadModule('/src/dashboard/server/ServerSidebar.jsx');
    const { default: AnnouncementsWorkspace } = await server.ssrLoadModule('/src/announcements/AnnouncementsWorkspace.jsx');
    const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
    const state = { data: guilds, loading: false, error: '', refreshing: false, retry() {} };
    const markup = render(ServerWorkspace, { route: overview(admin.id), state });
    assert.match(markup, /VISÃO GERAL/);
    assert.match(markup, /Estado do CYL/);
    assert.match(markup, /1\.204/);
    assert.match(markup, /6 abertos · 24 no total/);
    assert.match(markup, /href="#\/dashboard"[^>]*>.*Todos os servidores/);
    assert.match(markup, /href="#\/dashboard\/1546366426216931401" aria-current="page"/);
    assert.match(markup, /href="#\/dashboard\/1546366426216931401\/tickets"/);
    assert.match(markup, /href="#\/dashboard\/1546366426216931401\/announcements"/);
    assert.match(markup, /aria-haspopup="dialog"/);
    assert.match(markup, /aria-disabled="true"/);
    assert.doesNotMatch(markup, /href="[^\"]*\/(automation|settings|intelligence|access)"|Concluídos|Atividade recente|Bot conectado|CYL operacional/);
    assert.equal((markup.match(/<main\b/g) || []).length, 1);
    for (const id of [staff.id, denied.id, available.id, '1546366426216931499']) {
      const limited = render(ServerWorkspace, { route: overview(id), state });
      assert.doesNotMatch(limited, /Estado do CYL|Permissões do CYL|Configurações|Acessos e equipe|Servidor privado/);
      assert.match(limited, id === staff.id ? /Abrindo a central de Tickets/ : /não está disponível para sua conta/);
    }
    const nav = render(ServerSidebar, { guild: staff, section: 'tickets' });
    assert.match(nav, /aria-current="page"/);
    assert.doesNotMatch(nav, /Visão geral|Automação|Administração|Configurações/);
    const announcements = render(AnnouncementsWorkspace, { guild: admin, requireRelogin() {} });
    assert.match(announcements, /Avisos e atualizações/);
    assert.match(announcements, /Carregando configurações de publicação/);
    const unknown = render(ServerOverview, { guild: { ...admin, memberCount: null, ticketing: undefined, botPermissions: undefined, canViewTickets: false } });
    assert.doesNotMatch(unknown, /Métricas do servidor|Tickets abertos|Ações rápidas|[0-9]+ abertos/);
    assert.match(unknown, /Indisponível/);
    const zero = render(ServerOverview, { guild: { ...admin, memberCount: 0, ticketing: { enabled: true, total: 0, open: 0, closed: 0 } } });
    assert.match(zero, /0 abertos · 0 no total/);
    const stale = render(ServerWorkspace, { route: overview(admin.id), state: { ...state, error: 'Falha temporária' } });
    assert.match(stale, /última leitura válida/);
    assert.match(stale, /VISÃO GERAL/);
    const loading = render(ServerWorkspace, { route: overview(admin.id), state: { ...state, data: null, loading: true } });
    assert.match(loading, /Carregando servidor/);
    assert.doesNotMatch(loading, /CYL Community|VISÃO GERAL/);
    const unauthorized = render(ServerWorkspace, { route: overview(admin.id), state: { ...state, data: null, error: 'Sem acesso' } });
    assert.doesNotMatch(unauthorized, /CYL Community|VISÃO GERAL/);
  } finally { await server.close(); }
});
