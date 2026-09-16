import { useEffect, useState } from 'react';
import { getGuilds } from './dashboardApi';
import GuildCard from './GuildCard';

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
    <main className="app-shell dashboard-shell">
      <header className="dashboard-intro">
        <div className="dashboard-user">
          <img className="auth-avatar" src={user.avatarUrl} width="64" height="64" alt="Seu avatar do Discord" referrerPolicy="no-referrer" />
          <div><strong>{user.displayName}</strong><p>@{user.username}</p></div>
        </div>
        <p className="eyebrow">SUA COMUNIDADE, MAIS PERTO</p>
        <h1>Seus <em>servidores</em></h1>
        <p className="description">Veja onde o CylBot está e quais servidores você pode gerenciar.</p>
      </header>
      {state.status === 'loading' && <p className="dashboard-notice" role="status">Carregando seus servidores…</p>}
      {state.status === 'error' && <section className="dashboard-notice"><p role="alert">{state.error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></section>}
      {state.status === 'ready' && (selectedGuildId ? (
        <section className="dashboard-notice" aria-label="Servidor selecionado">
          <a className="back-link" href="#/dashboard">← Todos os servidores</a>
          {selected?.botInstalled && selected.canManage ? <><h2>Servidor selecionado: {selected.name}</h2><p>O painel de gerenciamento estará disponível em breve.</p></>
            : <p role="status">Este servidor não está disponível para gerenciamento.</p>}
        </section>
      ) : state.guilds.length ? (
        <section className="guild-grid" aria-label="Lista de servidores">{state.guilds.map(guild => <GuildCard key={guild.id} guild={guild} />)}</section>
      ) : <p className="dashboard-notice" role="status">Você ainda não participa de nenhum servidor no Discord.</p>)}
      <nav className="auth-links dashboard-tools" aria-label="Ferramentas existentes">
        <a href="#/texta_ai">Texta_AI →</a><a href="#/anuncios">Anúncios →</a>
      </nav>
    </main>
  );
}
