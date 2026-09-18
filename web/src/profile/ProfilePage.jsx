export default function ProfilePage({ user }) {
  return (
    <main className="profile-page">
      <section className="profile-hero">
        <div className="profile-banner"><span>PERFIL CYLBOT / BETA</span></div>
        <div className="profile-identity">
          <img src={user.avatarUrl} width="112" height="112" alt={`Avatar de ${user.displayName}`} referrerPolicy="no-referrer" />
          <div><span className="online-label"><i /> CONECTADO PELO DISCORD</span><h1>{user.displayName}</h1><p>@{user.username}</p></div>
          <span className="profile-status">Perfil básico</span>
        </div>
      </section>

      <div className="profile-layout">
        <section className="profile-main" aria-labelledby="about-profile">
          <span className="section-index">SOBRE</span>
          <h2 id="about-profile">Sua identidade no ecossistema CylBot.</h2>
          <p className="profile-placeholder">A bio personalizada estará disponível em uma próxima etapa. Por enquanto, seu nome e avatar seguem os dados públicos do Discord.</p>
          <div className="profile-activity">
            <span className="section-index">ATIVIDADE</span>
            <div className="empty-state"><strong>Nenhuma atividade pública ainda</strong><p>Conquistas e contribuições da comunidade aparecerão aqui no futuro.</p></div>
          </div>
        </section>
        <aside className="profile-sidebar">
          <section><span className="section-index">BADGES</span><div className="badge-placeholder"><i>+</i><p>Badges da comunidade<br />em breve</p></div></section>
          <section><span className="section-index">LINKS</span><p className="muted-copy">Links pessoais poderão ser adicionados quando a personalização do perfil estiver disponível.</p></section>
          <a className="button button-primary" href="#/dashboard">Abrir Dashboard <span>→</span></a>
        </aside>
      </div>
    </main>
  );
}
