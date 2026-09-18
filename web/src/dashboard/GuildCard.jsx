export default function GuildCard({ guild }) {
  return (
    <article className="guild-card">
      <div className="guild-heading">
        {guild.iconUrl ? <img className="guild-icon" src={guild.iconUrl} alt="" width="56" height="56" loading="lazy" referrerPolicy="no-referrer" />
          : <span className="guild-icon guild-fallback" aria-hidden="true">{Array.from(guild.name)[0]?.toUpperCase() || '?'}</span>}
        <div><h2>{guild.name}</h2><span className={`guild-status ${guild.botInstalled ? 'guild-installed' : ''}`}>{guild.botInstalled ? 'CylBot instalado' : 'CylBot não instalado'}</span></div>
      </div>
      <p className="guild-access">{guild.canManage ? 'Você pode gerenciar este servidor.' : 'Sem permissão para gerenciar.'}</p>
      <div className="guild-action">
        {guild.botInstalled && guild.canManage ? <a className="button button-primary" href={`#/dashboard/${guild.id}`}>Gerenciar <span aria-hidden="true">→</span></a>
          : guild.botInstalled ? <p className="guild-caption">Informações disponíveis apenas para consulta.</p>
            : <><button type="button" disabled>Adicionar CylBot</button><p className="guild-caption">Adição pelo painel em breve.</p></>}
      </div>
    </article>
  );
}
