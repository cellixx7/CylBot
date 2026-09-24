export default function GuildCard({ guild, stale = false }) {
  return (
    <article className="guild-card">
      <div className="guild-heading">
        {guild.iconUrl ? <img className="guild-icon" src={guild.iconUrl} alt="" width="56" height="56" loading="lazy" referrerPolicy="no-referrer" />
          : <span className="guild-icon guild-fallback" aria-hidden="true">{Array.from(guild.name)[0]?.toUpperCase() || '?'}</span>}
        <div><h2>{guild.name}</h2><span className={`guild-status ${guild.botInstalled ? 'guild-installed' : ''}`}>{guild.botInstalled ? 'CylBot instalado' : 'CylBot não instalado'}{stale && ' na última consulta'}</span></div>
      </div>
      <p className="guild-access">{stale ? 'Acesso aguardando atualização.' : guild.canManage ? 'Você pode gerenciar este servidor.' : 'Sem permissão para gerenciar.'}</p>
      <div className="guild-action">
        {guild.botInstalled && <a className="button button-primary" href={`#/dashboard/${guild.id}/tickets`}>Ver tickets <span aria-hidden="true">→</span></a>}
        {guild.botInstalled && guild.canManage && !stale ? <a className="button button-primary" href={`#/dashboard/${guild.id}`}>Gerenciar <span aria-hidden="true">→</span></a>
          : guild.botInstalled ? <p className="guild-caption">Consulte os tickets aos quais você tem acesso.</p>
            : <><button type="button" disabled>Adicionar CylBot</button><p className="guild-caption">Adição pelo painel em breve.</p></>}
      </div>
    </article>
  );
}
