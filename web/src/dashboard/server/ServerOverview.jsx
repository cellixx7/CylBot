import { ArrowRight, Bell, Bot, Palette, ShieldCheck, Ticket, Users, Zap } from 'lucide-react';
import { formatNumber, PermissionLabel } from '../GuildCard.jsx';

const upcoming = [
  [Bell, 'Avisos e atualizações', 'Comunicação oficial e novidades do CYL.'],
  [Zap, 'Automação', 'Rotinas para a sua comunidade.'],
  [Bot, 'Inteligência', 'Assistente e recursos de IA do servidor.'],
  [Palette, 'Personalização', 'Uma experiência com a identidade da comunidade.'],
];

export default function ServerOverview({ guild }) {
  const ticketing = guild.ticketing;
  const metrics = [
    { label: 'Membros', value: guild.memberCount, Icon: Users },
    ...(ticketing?.enabled === true ? [
      { label: 'Tickets abertos', value: ticketing.open, Icon: Ticket },
      { label: 'Tickets fechados', value: ticketing.closed, dot: 'is-closed' },
      { label: 'Tickets totais', value: ticketing.total, dot: 'is-open' },
    ] : []),
  ].filter(item => Number.isFinite(item.value));
  const ticketsHref = `#/dashboard/${guild.id}/tickets`;

  return <div className="server-overview">
    <div className="dashboard-intro"><div>
      <p className="dashboard-kicker">VISÃO GERAL</p>
      <h1>{guild.name}</h1>
      <p className="dashboard-description">Acompanhe o estado da comunidade e acesse os principais recursos do CYL.</p>
    </div></div>

    <section className="server-panel server-health" aria-labelledby="server-health-title">
      <div className="server-section-heading"><h2 id="server-health-title">Estado do CYL</h2><span className="server-state is-active">Instalado</span></div>
      <div className="server-health-items">
        <div><span className="dashboard-detail-label">Presença no servidor</span><strong className="server-health-success">CYL instalado</strong></div>
        <div><span className="dashboard-detail-label">Permissões do CYL</span><PermissionLabel state={guild.botPermissions?.state} /></div>
        <div><span className="dashboard-detail-label">Sistema de Tickets</span><strong className={ticketing?.enabled === true ? 'server-health-success' : ''}>{ticketing?.enabled === true ? 'Ativo' : ticketing?.enabled === false ? 'Não configurado' : 'Indisponível'}</strong></div>
      </div>
      {guild.botPermissions?.state === 'limited' && <p className="server-attention"><ShieldCheck size={15} aria-hidden="true" />A permissão de administrador do CYL não foi detectada. Algumas operações podem exigir permissões adicionais.</p>}
    </section>

    {metrics.length > 0 && <section className="dashboard-expanded-stats server-metrics" aria-label="Métricas do servidor">
      {metrics.map(({ label, value, Icon, dot }) => <div key={label}>{Icon ? <Icon size={15} aria-hidden="true" /> : <span className={`dashboard-stat-dot ${dot}`} aria-hidden="true" />}<strong>{formatNumber(value)}</strong><span>{label}</span></div>)}
    </section>}

    <section className="server-resources" aria-labelledby="server-resources-title">
      <div className="server-section-heading"><h2 id="server-resources-title">Recursos</h2><span>Seu servidor, em um só lugar</span></div>
      <div className="server-resource-grid">
        <article className="server-panel server-resource server-resource-tickets">
          <div className="server-resource-heading"><Ticket size={18} aria-hidden="true" /><h3>Tickets</h3><span className={`server-state${ticketing?.enabled === true ? ' is-active' : ''}`}>{ticketing?.enabled === true ? 'Ativo' : ticketing?.enabled === false ? 'Não configurado' : 'Indisponível'}</span></div>
          <p>{ticketing?.enabled === true
            ? `${formatNumber(ticketing.open)} abertos · ${formatNumber(ticketing.total)} no total`
            : ticketing?.enabled === false ? 'O sistema de Tickets ainda não está configurado neste servidor.' : 'O estado de Tickets não está disponível nesta leitura.'}</p>
          {guild.canViewTickets && <a className="dashboard-button dashboard-button-secondary" href={ticketsHref}>Acompanhar tickets <ArrowRight size={15} aria-hidden="true" /></a>}
          {!guild.canViewTickets && ticketing?.enabled === true && <small className="dashboard-muted">Sua conta não possui acesso à central de Tickets.</small>}
        </article>
        {upcoming.map(([Icon, label, description]) => <article className="server-panel server-resource" key={label}>
          <div className="server-resource-heading"><Icon size={18} aria-hidden="true" /><h3>{label}</h3><span className="server-state">Em breve</span></div>
          <p>{description}</p>
        </article>)}
      </div>
    </section>

    {guild.canViewTickets && <section className="server-panel server-quick-actions" aria-labelledby="server-actions-title">
      <div><h2 id="server-actions-title">Ações rápidas</h2><p>Continue o atendimento da sua comunidade.</p></div>
      <a className="dashboard-button dashboard-button-primary" href={ticketsHref}>Acompanhar tickets <ArrowRight size={15} aria-hidden="true" /></a>
    </section>}
  </div>;
}
