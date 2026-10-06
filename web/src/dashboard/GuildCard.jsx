import { useState } from 'react';
import { ArrowRight, Check, MoreHorizontal, ExternalLink, ShieldCheck, Ticket, Users } from 'lucide-react';
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
  if (!guild.botInstalled) return guild.canAddBot && discordInstallUrl
    ? <div className="dashboard-actions"><a className="dashboard-button dashboard-button-primary" href={discordInstallUrl} target="_blank" rel="noreferrer" aria-label={`Adicionar CYL a ${guild.name}`}>Adicionar CYL <ExternalLink size={16} aria-hidden="true" /></a></div>
    : <p className="dashboard-muted">A instalação não está disponível para esta conta.</p>;
  return <div className="dashboard-actions">
    {guild.canManage && <a className="dashboard-button dashboard-button-primary" href={`#/dashboard/${guild.id}`} aria-label={`Gerenciar ${guild.name}`}>Gerenciar servidor <ArrowRight size={16} aria-hidden="true" /></a>}
    {guild.canViewTickets && <a className={`dashboard-button dashboard-button-${guild.canManage ? 'secondary' : 'primary'}`} href={`#/dashboard/${guild.id}/tickets`} aria-label={`Acompanhar tickets de ${guild.name}`}>Acompanhar tickets <Ticket size={16} aria-hidden="true" /></a>}
    {stale && <small className="dashboard-stale-note">Ações usando a última leitura válida.</small>}
  </div>;
}

function InstalledDetails({ guild, stale }) {
  const ticketing = guild.ticketing || { enabled: false, total: 0, open: 0, closed: 0 };
  return <div className="dashboard-expanded-content">
    <div className="dashboard-expanded-stats">
      <div><Users size={15} aria-hidden="true" /><strong>{formatNumber(guild.memberCount)}</strong><span>Membros</span></div>
      <div><Ticket size={15} aria-hidden="true" /><strong>{ticketing.enabled ? formatNumber(ticketing.total) : '—'}</strong><span>Tickets totais</span></div>
      <div><span className="dashboard-stat-dot is-open" aria-hidden="true" /><strong>{ticketing.enabled ? formatNumber(ticketing.open) : '—'}</strong><span>Abertos</span></div>
      <div><span className="dashboard-stat-dot is-closed" aria-hidden="true" /><strong>{ticketing.enabled ? formatNumber(ticketing.closed) : '—'}</strong><span>Fechados</span></div>
    </div>
    <div className="dashboard-expanded-columns">
      <div><span className="dashboard-detail-label">Permissões do CYL</span><PermissionLabel state={guild.botPermissions?.state} /></div>
      <div><span className="dashboard-detail-label">Sistema de Tickets</span><strong className={ticketing.enabled ? 'dashboard-detail-success' : ''}>{ticketing.enabled ? 'Ativo' : 'Não configurado'}</strong></div>
      <div><span className="dashboard-detail-label">Seu acesso</span><AccessBadges guild={guild} /></div>
    </div>
    <GuildActions guild={guild} stale={stale} />
  </div>;
}

function AvailableDetails({ guild }) {
  return <div className="dashboard-expanded-content dashboard-available-detail">
    <div className="dashboard-install-message"><h4>Você pode adicionar o CYL</h4><p>Sua conta possui permissão suficiente neste servidor. A instalação abre o fluxo oficial do Discord.</p></div>
    <GuildActions guild={guild} />
  </div>;
}

export default function GuildCard({ guild, variant = 'card', expanded = false, onToggle, stale = false }) {
  const isAvailable = !guild.botInstalled;
  const titleId = `guild-title-${guild.id}`;
  const detailsId = `guild-details-${guild.id}`;
  return <article className={`dashboard-guild-card dashboard-guild-${variant}${isAvailable ? ' is-available' : ''}${expanded ? ' is-expanded' : ''}`} aria-labelledby={titleId}>
    <div className="dashboard-guild-summary" onClick={variant !== 'detail' ? event => {
      if (event.target.closest('a, button, input, select, textarea, label')) return;
      onToggle?.();
    } : undefined}>
      <GuildIcon guild={guild} large={variant === 'detail'} />
      <div className="dashboard-guild-identity">
        <h3 id={titleId}>{guild.name}</h3>
        <span className={`dashboard-guild-status${guild.botInstalled ? ' is-installed' : ' is-available'}`}><span aria-hidden="true" />{guild.botInstalled ? 'CYL instalado' : 'CYL não instalado'}{stale && ' · leitura anterior'}</span>
      </div>
      {(!isAvailable && (!expanded || variant === 'list')) && <AccessBadges guild={guild} />}
      {isAvailable && variant === 'list' && guild.canAddBot && <div className="dashboard-badges"><span className="dashboard-badge dashboard-badge-manage">Pode adicionar</span></div>}
      {isAvailable && variant === 'list' && !expanded && <GuildActions guild={guild} />}
      {variant !== 'detail' && <button type="button" className="dashboard-expand-button" aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle} aria-label={`Opções de ${guild.name}`}><MoreHorizontal size={20} aria-hidden="true" /></button>}
    </div>
    {variant === 'card' && !expanded && !isAvailable && (Number.isFinite(guild.memberCount) || (guild.ticketing?.enabled && Number.isFinite(guild.ticketing.open))) && <div className="dashboard-compact-meta">
      {Number.isFinite(guild.memberCount) && <span><Users size={15} aria-hidden="true" />{formatNumber(guild.memberCount)} membros</span>}
      {guild.ticketing?.enabled && Number.isFinite(guild.ticketing.open) && <span><Ticket size={15} aria-hidden="true" />{formatNumber(guild.ticketing.open)} tickets abertos</span>}
    </div>}
    {variant === 'card' && !expanded && isAvailable && <><p className="dashboard-install-hint">Você possui permissão para instalar o CYL neste servidor.</p><GuildActions guild={guild} /></>}
    {expanded && <div id={detailsId} className="dashboard-guild-details">{isAvailable ? <AvailableDetails guild={guild} /> : <InstalledDetails guild={guild} stale={stale} />}</div>}
  </article>;
}
