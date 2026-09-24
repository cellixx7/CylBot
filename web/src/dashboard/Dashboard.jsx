import { getGuilds } from './dashboardApi.js';
import GuildCard from './GuildCard.jsx';
import { useReadPolling } from '../lib/useReadPolling.js';

export default function Dashboard({ user, selectedGuildId, requireRelogin }) {
  const state = useReadPolling(getGuilds, requireRelogin, 60000);
  const guilds = state.data || [];
  const selected = guilds.find(guild => guild.id === selectedGuildId);

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

      {state.loading && <div className="dashboard-notice" role="status"><span className="loading-mark" />Carregando seus servidores...</div>}
      {state.error && <section className="dashboard-notice"><div role="alert"><p>{state.error}</p>
        {state.updatedAt && <p>Dados da última consulta, em {new Date(state.updatedAt).toLocaleString('pt-BR')}. O acesso será revalidado ao abrir uma ferramenta.</p>}
        {state.retryAt && <p>Próxima tentativa a partir de {new Date(state.retryAt).toLocaleTimeString('pt-BR')}, com a aba visível.</p>}</div>
        <button className="button button-primary" type="button" disabled={state.refreshing || state.retryAt > Date.now()} onClick={state.retry}>Tentar novamente</button></section>}
      {state.data && (selectedGuildId ? (
        <section className="guild-detail" aria-label="Servidor selecionado">
          <a className="text-link" href="#/dashboard">← Todos os servidores</a>
          {selected?.botInstalled && <p><a className="button button-primary" href={`#/dashboard/${selected.id}/tickets`}>Ver tickets</a></p>}
          {selected?.botInstalled && selected.canManage && !state.error ? <><span className="section-index">SERVIDOR SELECIONADO</span><h2>{selected.name}</h2><p>O painel de gerenciamento deste servidor estará disponível em breve.</p></>
            : <p role="status">Este servidor não está disponível para gerenciamento.</p>}
        </section>
      ) : guilds.length ? (
        <section className="guild-section"><div className="guild-section-heading"><span className="section-index">COMUNIDADES</span><p>{guilds.length} {guilds.length === 1 ? 'servidor encontrado' : 'servidores encontrados'}</p></div><div className="guild-grid" aria-label="Lista de servidores">{guilds.map(guild => <GuildCard key={guild.id} guild={guild} stale={Boolean(state.error)} />)}</div></section>
      ) : <p className="dashboard-notice" role="status">Você ainda não participa de nenhum servidor no Discord.</p>)}
    </main>
  );
}
