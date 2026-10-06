import { useState } from 'react';
import { ArrowRight, Check, ChevronDown, ExternalLink, ShieldCheck, Ticket, Users } from 'lucide-react';
import { discordInstallUrl } from '../lib/discordLinks.js';

function GuildIcon({ guild, large = false }) {
  const [failed, setFailed] = useState(false);
  const initial = Array.from(guild.name || '?')[0]?.toLocaleUpperCase('pt-BR') || '?';
  return guild.iconUrl && !failed
    ? <img className={`dashboard-guild-icon${large ? ' is-large' : ''}`} src={guild.iconUrl} alt="" width={large ? 72 : 52} height={large ? 72 : 52} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className={`dashboard-guild-icon dashboard-guild-fallback${large ? ' is-large' : ''}`} aria-hidden="true">{initial}</span>;
}

function formatNumber(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('pt-BR').format(value) : '—';
}

function PermissionLabel({ state }) {
  const labels = { ok: 'Ativas', limited: 'Limitadas', unknown: 'Indisponível', not_installed: 'Não instalado' };
  return <span className={`dashboard-permission dashboard-permission-${state || 'unknown'}`}><ShieldCheck size={15} aria-hidden="true" />{labels[state] || 'Indisponível'}</span>;
}

function AccessBadges({ guild }) {
  return <div className="dashboard-badges">
    {guild.canManage && <span className="dashboard-badge dashboard-badge-manage"><Check size={13} aria-hidden="true" />Pode gerenciar</span>}
    {guild.canViewTickets && <span className="dashboard-badge dashboard-badge-ticket"><Ticket size={13} aria-hidden="true" />Tickets</span>}
  </div>;
}

function GuildActions({ guild, stale = false }) {
  if (!guild.botInstalled) return <div className="dashboard-actions"><a className="dashboard-button dashboard-button-primary" href={discordInstallUrl || '#/dashboard'} target={discordInstallUrl ? '_blank' : undefined} rel={discordInstallUrl ? 'noreferrer' : undefined} aria-label={`Adicionar CylBot a ${guild.name}`}>Adicionar CylBot <ExternalLink size={16} aria-hidden="true" /></a></div>;
  return <div className="dashboard-actions">
    {guild.canManage && <a className="dashboard-button dashboard-button-primary" href={`#/dashboard/${guild.id}`} aria-label={`Gerenciar ${guild.name}`}>Gerenciar servidor <ArrowRight size={16} aria-hidden="true" /></a>}
    {guild.canViewTickets && <a className="dashboard-button dashboard-button-secondary" href={`#/dashboard/${guild.id}/tickets`} aria-label={`Ver tickets de ${guild.name}`}>Ver tickets <Ticket size={16} aria-hidden="true" /></a>}
    {stale && <small className="dashboard-stale-note">Ações usando a última leitura válida.</small>}
  </div>;
}

function InstalledDetails({ guild, stale }) {
  const ticketing = guild.ticketing || { enabled: false, total: 0, open: 0, closed: 0 };
  return <div className="dashboard-expanded-content">
    <div className="dashboard-expanded-stats">
      <div><Users size={17} aria-hidden="true" /><span>Membros</span><strong>{formatNumber(guild.memberCount)}</strong></div>
      <div><Ticket size={17} aria-hidden="true" /><span>Tickets totais</span><strong>{ticketing.enabled ? formatNumber(ticketing.total) : '—'}</strong></div>
      <div><span className="dashboard-stat-dot is-open" aria-hidden="true" /><span>Em aberto</span><strong>{ticketing.enabled ? formatNumber(ticketing.open) : '—'}</strong></div>
      <div><span className="dashboard-stat-dot is-closed" aria-hidden="true" /><span>Encerrados</span><strong>{ticketing.enabled ? formatNumber(ticketing.closed) : '—'}</strong></div>
    </div>
    <div className="dashboard-expanded-columns">
      <div><span className="dashboard-detail-label">Permissões do CylBot</span><PermissionLabel state={guild.botPermissions?.state} /></div>
      <div><span className="dashboard-detail-label">Sistema de Tickets</span><strong className={ticketing.enabled ? 'dashboard-detail-success' : ''}>{ticketing.enabled ? 'Ativo' : 'Não configurado'}</strong></div>
      <div><span className="dashboard-detail-label">Seu acesso</span><AccessBadges guild={guild} /></div>
    </div>
    <GuildActions guild={guild} stale={stale} />
  </div>;
}

function AvailableDetails({ guild }) {
  return <div className="dashboard-expanded-content dashboard-available-detail">
    <p>Você pode adicionar o CylBot a este servidor usando sua conta do Discord.</p>
    {guild.canAddBot && discordInstallUrl ? <a className="dashboard-button dashboard-button-primary" href={discordInstallUrl} target="_blank" rel="noreferrer" aria-label={`Adicionar CylBot a ${guild.name}`}>Adicionar CylBot <ExternalLink size={16} aria-hidden="true" /></a> : <p className="dashboard-muted">A instalação não está disponível para esta conta.</p>}
  </div>;
}

export default function GuildCard({ guild, variant = 'card', expanded = false, onToggle, stale = false }) {
  const isAvailable = !guild.botInstalled;
  const titleId = `guild-title-${guild.id}`;
  const detailsId = `guild-details-${guild.id}`;
  return <article className={`dashboard-guild-card dashboard-guild-${variant}${expanded ? ' is-expanded' : ''}`} aria-labelledby={titleId}>
    <div className="dashboard-guild-summary">
      <GuildIcon guild={guild} large={variant === 'detail'} />
      <div className="dashboard-guild-identity">
        <h3 id={titleId}>{guild.name}</h3>
        <span className={`dashboard-guild-status${guild.botInstalled ? ' is-installed' : ' is-available'}`}><span aria-hidden="true" />{guild.botInstalled ? 'CylBot instalado' : 'Disponível para adicionar'}{stale && ' · leitura anterior'}</span>
        <AccessBadges guild={guild} />
      </div>
      {variant !== 'detail' && <button type="button" className="dashboard-expand-button" aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle} aria-label={`${expanded ? 'Recolher' : 'Expandir'} detalhes de ${guild.name}`}><ChevronDown size={18} aria-hidden="true" /></button>}
    </div>
    {variant === 'card' && <div className="dashboard-compact-meta"><span><Users size={15} aria-hidden="true" />{formatNumber(guild.memberCount)} membros</span><span><Ticket size={15} aria-hidden="true" />{guild.ticketing?.enabled ? `${formatNumber(guild.ticketing.open)} abertos` : 'Tickets não configurados'}</span></div>}
    {!expanded && <GuildActions guild={guild} stale={stale} />}
    {expanded && <div id={detailsId} className="dashboard-guild-details">{isAvailable ? <AvailableDetails guild={guild} /> : <InstalledDetails guild={guild} stale={stale} />}</div>}
  </article>;
}
