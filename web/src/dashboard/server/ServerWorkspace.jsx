import { lazy, Suspense, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { GuildIcon } from '../GuildCard.jsx';
import { workspaceAccess } from './workspaceAccess.js';
import ServerOverview from './ServerOverview.jsx';
import ServerSidebar from './ServerSidebar.jsx';
import ServerSwitcher from './ServerSwitcher.jsx';
import '../dashboard.css';
import './server.css';

const TicketsPage = lazy(() => import('../../tickets/TicketsPage.jsx'));
const AnnouncementsWorkspace = lazy(() => import('../../announcements/AnnouncementsWorkspace.jsx'));

export default function ServerWorkspace({ route, state, requireRelogin }) {
  const access = state.data ? workspaceAccess(state.data, route) : null;
  const guild = access?.guild;
  const stale = Boolean(state.error && state.data);

  useEffect(() => {
    if (access?.status === 'redirect') window.location.replace(access.href);
  }, [access?.status, access?.href]);

  return <main className="dashboard-page cyl-dashboard server-workspace">
    <a className="dashboard-back-link server-back" href="#/dashboard"><ArrowLeft size={14} aria-hidden="true" />Todos os servidores</a>
    {state.loading && <div className="dashboard-notice" role="status">Carregando servidor...</div>}
    {state.error && <section className="dashboard-notice dashboard-error"><div role="alert"><p>{state.error}</p>
      {stale && <p>Exibindo a última leitura válida. O estado atual pode ter mudado.</p>}
      <button type="button" className="dashboard-text-button" onClick={state.retry} disabled={state.refreshing || Boolean(state.retryAt && Date.now() < state.retryAt)}>Tentar novamente</button>
    </div></section>}
    {access?.status === 'denied' && <div className="dashboard-empty" role="status">Este servidor não está disponível para sua conta.</div>}
    {access?.status === 'redirect' && <div className="dashboard-notice" role="status">Abrindo a central de Tickets...</div>}
    {guild && ['allowed', 'unavailable'].includes(access.status) && <>
      <section className="server-context" aria-label="Servidor atual">
        <GuildIcon key={guild.id} guild={guild} />
        <div className="server-context-identity"><strong>{guild.name}</strong><span className="dashboard-guild-status is-installed"><span aria-hidden="true" />CYL instalado{stale && ' · leitura anterior'}</span></div>
        <ServerSwitcher guild={guild} guilds={state.data} />
      </section>
      <div className="server-layout">
        <ServerSidebar guild={guild} section={route.section} />
        <div className="server-content">
          {access.status === 'unavailable' ? <div className="dashboard-empty" role="status">Esta seção ainda não está disponível.<a className="dashboard-back-link" href={guild.canManage ? `#/dashboard/${guild.id}` : `#/dashboard/${guild.id}/tickets`}>Ir para {guild.canManage ? 'Visão geral' : 'Tickets'}</a></div>
            : route.section === 'overview' ? <ServerOverview guild={guild} />
              : route.section === 'announcements' ? <Suspense fallback={<div className="dashboard-notice" role="status">Carregando avisos...</div>}><AnnouncementsWorkspace guild={guild} requireRelogin={requireRelogin} /></Suspense>
              : <Suspense fallback={<div className="dashboard-notice" role="status">Carregando Tickets...</div>}>
                <TicketsPage embedded key={guild.id} guildId={guild.id} ticketId={route.ticketId} requireRelogin={requireRelogin} />
              </Suspense>}
        </div>
      </div>
    </>}
  </main>;
}
