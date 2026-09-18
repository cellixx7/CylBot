import { useEffect, useState } from 'react';
import { getGuilds } from './dashboardApi.js';
import GuildCard from './GuildCard.jsx';

export default function Dashboard({ user, selectedGuildId, requireRelogin }) {
  const [state, setState] = useState({ status: 'loading', guilds: [], error: '' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', guilds: [], error: '' });
    getGuilds(controller.signal).then(guilds => {
      if (!controller.signal.aborted) setState({ status: 'ready', guilds, error: '' });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error.reloginRequired) requireRelogin();
      else setState({ status: 'error', guilds: [], error: error.message });
    });
    return () => controller.abort();
  }, [attempt, requireRelogin]);

  const selected = state.guilds.find(guild => guild.id === selectedGuildId);

  return (
    <main className="dashboard-page">
      <header className="dashboard-intro">
        <div>
          <p className="eyebrow">ÁREA OPERACIONAL</p>
          <h1>Seus <em>servidores.</em></h1>
          <p className="description">Veja onde o CylBot está e quais comunidades você pode gerenciar.</p>
        </div>
        <a className="dashboard-user" href="#/profile">
          <img src={user.avatarUrl} width="48" height="48" alt="" referrerPolicy="no-referrer" />
          <span><strong>{user.displayName}</strong><small>@{user.username}</small></span>
        </a>
      </header>

      <nav className="dashboard-tools" aria-label="Ferramentas existentes">
        <span>FERRAMENTAS</span><a href="#/texta_ai">Texta_AI <b>→</b></a><a href="#/anuncios">Anúncios <b>→</b></a>
      </nav>

      {state.status === 'loading' && <div className="dashboard-notice" role="status"><span className="loading-mark" />Carregando seus servidores...</div>}
      {state.status === 'error' && <section className="dashboard-notice"><p role="alert">{state.error}</p><button className="button button-primary" type="button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></section>}
      {state.status === 'ready' && (selectedGuildId ? (
        <section className="guild-detail" aria-label="Servidor selecionado">
          <a className="text-link" href="#/dashboard">← Todos os servidores</a>
          {selected?.botInstalled && selected.canManage ? <><span className="section-index">SERVIDOR SELECIONADO</span><h2>{selected.name}</h2><p>O painel de gerenciamento deste servidor estará disponível em breve.</p></>
            : <p role="status">Este servidor não está disponível para gerenciamento.</p>}
        </section>
      ) : state.guilds.length ? (
        <section className="guild-section"><div className="guild-section-heading"><span className="section-index">COMUNIDADES</span><p>{state.guilds.length} {state.guilds.length === 1 ? 'servidor encontrado' : 'servidores encontrados'}</p></div><div className="guild-grid" aria-label="Lista de servidores">{state.guilds.map(guild => <GuildCard key={guild.id} guild={guild} />)}</div></section>
      ) : <p className="dashboard-notice" role="status">Você ainda não participa de nenhum servidor no Discord.</p>)}
    </main>
  );
}
