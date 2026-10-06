import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { getGuilds } from './dashboardApi.js';
import GuildCard from './GuildCard.jsx';
import { useReadPolling } from '../lib/useReadPolling.js';
import './dashboard.css';

const VISIBILITY_FILTERS = [
  ['all', 'Exibir todos'],
  ['installed', 'Com CylBot'],
  ['available', 'Disponíveis para adicionar'],
];
const ACCESS_FILTERS = [
  ['all', 'Qualquer acesso'],
  ['manage', 'Pode gerenciar'],
  ['tickets', 'Tickets'],
];

function FilterMenu({ visibility, access, onVisibilityChange, onAccessChange, onClose }) {
  return (
    <div className="dashboard-filter-menu" role="dialog" aria-label="Filtros de servidores">
      <div className="dashboard-filter-menu-header">
        <strong>Filtrar servidores</strong>
        <button type="button" className="dashboard-icon-button" onClick={onClose} aria-label="Fechar filtros"><X size={16} /></button>
      </div>
      <fieldset>
        <legend>Disponibilidade</legend>
        {VISIBILITY_FILTERS.map(([value, label]) => (
          <label key={value} className="dashboard-filter-option">
            <input type="radio" name="dashboard-visibility" value={value} checked={visibility === value} onChange={() => onVisibilityChange(value)} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Acesso</legend>
        {ACCESS_FILTERS.map(([value, label]) => (
          <label key={value} className="dashboard-filter-option">
            <input type="radio" name="dashboard-access" value={value} checked={access === value} onChange={() => onAccessChange(value)} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

function DashboardToolbar({ query, visibility, access, onQueryChange, onVisibilityChange, onAccessChange }) {
  const [open, setOpen] = useState(false);
  const activeCount = Number(visibility !== 'all') + Number(access !== 'all');
  return (
    <section className="dashboard-toolbar" aria-label="Busca e filtros">
      <label className="dashboard-search">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Buscar servidor</span>
        <input value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Buscar servidor..." type="search" />
      </label>
      <div className="dashboard-filter-wrap">
        <button type="button" className={`dashboard-filter-button${activeCount ? ' is-active' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          <SlidersHorizontal size={17} aria-hidden="true" /> Filtros {activeCount > 0 && <span aria-label={`${activeCount} filtros ativos`}>{activeCount}</span>}
        </button>
        {open && <FilterMenu visibility={visibility} access={access} onVisibilityChange={onVisibilityChange} onAccessChange={onAccessChange} onClose={() => setOpen(false)} />}
      </div>
    </section>
  );
}

function EmptyState({ children, compact = false }) {
  return <div className={`dashboard-empty${compact ? ' is-compact' : ''}`} role="status">{children}</div>;
}

function GuildGroup({ title, description, guilds, mode, expandedGuildId, onToggle, stale, emptyMessage, listMode }) {
  return (
    <section className="dashboard-group" aria-labelledby={`dashboard-group-${mode}`}>
      <div className="dashboard-group-heading">
        <div><span className="dashboard-kicker">{mode === 'installed' ? 'SEUS SERVIDORES' : 'DISPONÍVEIS'}</span><h2 id={`dashboard-group-${mode}`}>{title}</h2></div>
        <p>{description}</p>
      </div>
      {guilds.length ? (
        <div className={`dashboard-guild-results${listMode ? ' is-list' : ''}`} aria-label={title}>
          {guilds.map(guild => <GuildCard key={guild.id} guild={guild} variant={listMode ? 'list' : 'card'} expanded={expandedGuildId === guild.id} onToggle={() => onToggle(guild.id)} stale={stale} />)}
        </div>
      ) : <EmptyState compact>{emptyMessage}</EmptyState>}
    </section>
  );
}

export default function Dashboard({ user, selectedGuildId, requireRelogin }) {
  const state = useReadPolling(getGuilds, requireRelogin, 60000);
  const guilds = state.data || [];
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [access, setAccess] = useState('all');
  const [expandedGuildId, setExpandedGuildId] = useState(selectedGuildId || null);
  const stale = Boolean(state.error && state.data);

  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') setExpandedGuildId(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  useEffect(() => {
    if (selectedGuildId) setExpandedGuildId(selectedGuildId);
  }, [selectedGuildId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return guilds.filter(guild => {
      const matchesQuery = !normalized || guild.name.toLocaleLowerCase('pt-BR').includes(normalized);
      const matchesVisibility = visibility === 'all' || (visibility === 'installed' ? guild.botInstalled : !guild.botInstalled);
      const matchesAccess = access === 'all' || (access === 'manage' ? guild.canManage : guild.canViewTickets);
      return matchesQuery && matchesVisibility && matchesAccess;
    });
  }, [guilds, query, visibility, access]);

  const installed = filtered.filter(guild => guild.botInstalled);
  const available = filtered.filter(guild => !guild.botInstalled);
  const listMode = filtered.length > 5;
  const selected = guilds.find(guild => guild.id === selectedGuildId);

  return (
    <main className="dashboard-page cyl-dashboard">
      <header className="dashboard-intro">
        <div>
          <p className="dashboard-kicker">ÁREA OPERACIONAL</p>
          <h1>Seus <em>servidores.</em></h1>
          <p className="dashboard-description">Gerencie suas comunidades e acompanhe os tickets em um só lugar.</p>
        </div>
        <a className="dashboard-user" href="#/profile">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" width="48" height="48" referrerPolicy="no-referrer" /> : <span className="dashboard-user-fallback" aria-hidden="true">{Array.from(user.displayName || user.username || '?')[0]}</span>}
          <span><strong>{user.displayName}</strong><small>@{user.username}</small></span>
        </a>
      </header>

      <DashboardToolbar query={query} visibility={visibility} access={access} onQueryChange={setQuery} onVisibilityChange={setVisibility} onAccessChange={setAccess} />

      {state.loading && <div className="dashboard-notice" role="status"><span className="loading-mark" />Carregando seus servidores...</div>}
      {state.error && <section className="dashboard-notice dashboard-error"><div role="alert"><p>{state.error}</p><button type="button" className="dashboard-text-button" onClick={state.retry} disabled={state.refreshing || Boolean(state.retryAt && Date.now() < state.retryAt)}>Tentar novamente</button></div></section>}

      {state.data && selectedGuildId ? (
        <section className="dashboard-selected" aria-label="Servidor selecionado">
          <a className="dashboard-back-link" href="#/dashboard">← Todos os servidores</a>
          {selected ? <GuildCard guild={selected} variant="detail" expanded onToggle={() => setExpandedGuildId(null)} stale={stale} /> : <EmptyState>Este servidor não está disponível para sua conta.</EmptyState>}
        </section>
      ) : state.data && guilds.length ? (
        <div className="dashboard-results">
          {filtered.length ? <>
            <GuildGroup title="Com CylBot" description={`${installed.length} ${installed.length === 1 ? 'servidor' : 'servidores'}`} guilds={installed} mode="installed" expandedGuildId={expandedGuildId} onToggle={id => setExpandedGuildId(current => current === id ? null : id)} stale={stale} listMode={listMode} emptyMessage="Nenhum servidor instalado corresponde aos filtros atuais." />
            <GuildGroup title="Disponíveis para adicionar" description={`${available.length} ${available.length === 1 ? 'servidor' : 'servidores'}`} guilds={available} mode="available" expandedGuildId={expandedGuildId} onToggle={id => setExpandedGuildId(current => current === id ? null : id)} stale={stale} listMode={listMode} emptyMessage="Nenhum servidor disponível corresponde aos filtros atuais." />
          </> : <EmptyState>Nenhum servidor corresponde à busca ou aos filtros atuais.</EmptyState>}
        </div>
      ) : state.data ? <EmptyState>Você ainda não participa de nenhum servidor no Discord.</EmptyState> : null}
    </main>
  );
}
