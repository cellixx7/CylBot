import { useEffect, useState } from 'react';
import { BadgeCheck, Check, ExternalLink, Palette, Pencil, Save, Shield, UserRound, X } from 'lucide-react';
import { getProfile, getCommunities, saveProfile } from './profileApi.js';
import './profile.css';
const visibilityNames = { PUBLIC: 'Público', COMMUNITY: 'Comunidades compartilhadas', PRIVATE: 'Somente eu' };
const empty = { bio: '', accent: '#7c5cff', theme: 'CLASSIC', visibility: 'COMMUNITY', links: [] };
export function ProfileCard({ data, profile = data.profile, onEdit, editing = false }) {
  return <article className={`cyl-profile-card theme-${profile.theme.toLowerCase()}`} style={{ '--profile-accent': profile.accent }} aria-label="Perfil CYL">
    <div className="cyl-card-banner" aria-hidden="true" />
    <div className="cyl-card-content">{data.user.avatarUrl ? <img className="cyl-card-avatar" src={data.user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span className="cyl-card-avatar cyl-avatar-fallback"><UserRound aria-hidden="true" /></span>}
      <div className="cyl-profile-name-row"><h1>{data.user.displayName}</h1>{onEdit && <button className="dashboard-button cyl-profile-edit-pencil" type="button" aria-label="Editar perfil" title="Editar perfil" aria-expanded={editing} aria-controls="cyl-profile-editor" onClick={onEdit}><Pencil size={19} aria-hidden="true" /></button>}</div><p className="cyl-profile-handle">@{data.user.username}</p>
      <div className="cyl-profile-badges">{data.badges.map(b => <span key={b.id} className={`cyl-profile-badge badge-${b.id.toLowerCase()}`}><BadgeCheck size={14} aria-hidden="true" />{b.label}</span>)}{data.community && <span className="cyl-profile-badge"><Shield size={14} aria-hidden="true" />{data.community.roleName}</span>}</div>
      <p className="cyl-card-bio">{profile.bio || 'Este perfil ainda não possui uma bio.'}</p>
      {profile.links.length > 0 && <ul className="cyl-profile-links">{profile.links.filter(link => link.label && /^https:\/\//i.test(link.url)).map((link, index) => <li key={index}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ExternalLink size={13} aria-hidden="true" /></a></li>)}</ul>}
      {data.community && <div className="cyl-card-community"><small>COMUNIDADE</small><strong>{data.community.name}</strong></div>}
      <footer>{visibilityNames[profile.visibility]} · {data.themes.find(t => t.id === profile.theme)?.name || 'Clássico'}</footer>
    </div>
  </article>;
}
export default function ProfilePage({ user, profileUserId = 'me', initialGuildId = '', requireRelogin = () => {} }) {
  const [data, setData] = useState(null), [draft, setDraft] = useState(empty), [guildId, setGuildId] = useState(initialGuildId);
  const [communities, setCommunities] = useState([]), [tab, setTab] = useState('identity'), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [communityError, setCommunityError] = useState('');
  const [editing, setEditing] = useState(false);
  const own = profileUserId === 'me' || profileUserId === user.id;
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setData(null); setNotice('');
    getProfile(profileUserId, guildId, controller.signal).then(result => { if (!controller.signal.aborted) { setData(result); setDraft(result.profile); } })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason.message); if (reason.status === 401) requireRelogin(); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [profileUserId, guildId]);
  useEffect(() => {
    if (!own) return;
    const controller = new AbortController();
    getCommunities(controller.signal).then(result => { if (!controller.signal.aborted) setCommunities(result.communities); }).catch(reason => { if (!controller.signal.aborted) setCommunityError(reason.message); });
    return () => controller.abort();
  }, [own]);
  function edit(key, value) { setDraft(previous => ({ ...previous, [key]: value })); setNotice(''); }
  function setLink(index, key, value) { edit('links', draft.links.map((link, i) => i === index ? { ...link, [key]: value } : link)); }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await saveProfile(draft); const updated = await getProfile(profileUserId, guildId); setData(updated); setDraft(updated.profile); setEditing(false); setNotice('Perfil salvo. A alteração também está disponível no Discord.'); }
    catch (reason) { setError(reason.message); if (reason.status === 401) requireRelogin(); }
    finally { setBusy(false); }
  }
  return <main className="profile-page cyl-profile"><header className="cyl-profile-heading"><div><p className="dashboard-kicker">{own ? 'MEU PERFIL' : 'PERFIL CYL'}</p></div><a className="dashboard-button dashboard-button-secondary" href="#/dashboard">Meus servidores</a></header>
    {error && <p className="dashboard-notice dashboard-error" role="alert">{error}</p>}{notice && <p className="dashboard-notice" role="status"><Check size={16} aria-hidden="true" />{notice}</p>}
    {loading ? <p className="dashboard-notice" role="status">Carregando perfil...</p> : data && <div className="cyl-profile-layout">
      <ProfileCard data={data} editing={editing} onEdit={data.canEdit ? () => { setDraft(data.profile); setTab('identity'); setEditing(true); setNotice(''); } : undefined} />
      {data.canEdit && editing && <section id="cyl-profile-editor" className="cyl-profile-editor" aria-label="Editar perfil"><form onSubmit={save}>
        <nav className="cyl-profile-tabs" aria-label="Personalização do perfil">{[['identity','Perfil',UserRound],['appearance','Aparência',Palette],['community','Comunidades',Shield]].map(([id,label,Icon]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} disabled={busy}><Icon size={16} aria-hidden="true" />{label}</button>)}</nav>
        <fieldset disabled={busy}>{tab === 'identity' && <div className="cyl-profile-fields"><h2>Apresente-se</h2><p>Seu nome e avatar acompanham o Discord. A bio e os links são escolhidos por você.</p>
          <label>Bio<textarea value={draft.bio} maxLength={500} rows={5} onChange={event => edit('bio', event.target.value)} placeholder="Conte um pouco sobre você e sua participação nas comunidades." /><small>{draft.bio.length}/500</small></label>
          <label>Quem pode ver meu perfil<select value={draft.visibility} onChange={event => edit('visibility', event.target.value)}>{Object.entries(visibilityNames).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className="cyl-profile-link-heading"><h3>Links pessoais</h3><button className="dashboard-button" type="button" disabled={draft.links.length >= 3} onClick={() => edit('links',[...draft.links,{ label:'',url:'' }])}>Adicionar link</button></div>
          {draft.links.map((link,index) => <div className="cyl-profile-link-editor" key={index}><label>Título do link<input value={link.label} maxLength={80} required onChange={event => setLink(index,'label',event.target.value)} placeholder="Meu site" /></label><label>Endereço HTTPS<input type="url" value={link.url} maxLength={2048} required onChange={event => setLink(index,'url',event.target.value)} placeholder="https://" /></label><button type="button" className="cyl-profile-remove" aria-label={`Remover link ${index+1}`} onClick={() => edit('links',draft.links.filter((_,i) => i !== index))}><X size={16} aria-hidden="true" /></button></div>)}
          <small>Até três links. A visibilidade escolhida também vale para a bio e os links.</small>
        </div>}
        {tab === 'appearance' && <div className="cyl-profile-fields"><h2>Aparência do perfil</h2><p>As mudanças são aplicadas à sua página ao salvar.</p><label>Cor de destaque<div className="cyl-profile-color"><input type="color" value={draft.accent} onChange={event => edit('accent',event.target.value)} /><span>{draft.accent}</span></div></label>
          <div className="cyl-profile-theme-grid">{data.themes.map(theme => <button key={theme.id} type="button" className={`cyl-theme-choice theme-${theme.id.toLowerCase()}`} aria-pressed={draft.theme === theme.id} disabled={theme.plus && !data.hasPlus} onClick={() => edit('theme',theme.id)}><strong>{theme.name}</strong><small>{theme.plus ? 'CYL Plus' : 'Disponível para todos'}</small></button>)}</div>
          {!data.hasPlus && <p>Os temas Aurora e Cósmico ficam disponíveis com CYL Plus. Cor, bio e links estão disponíveis para todos.</p>}
        </div>}
        {tab === 'community' && <div className="cyl-profile-fields"><h2>Sua função em cada comunidade</h2><p>Os papéis são verificados no Discord. Os selos da Equipe CYL, de parceiro e de criador são oficiais da plataforma.</p>{communityError && <p role="alert">{communityError}</p>}
          <label>Comunidade<select value={guildId} onChange={event => setGuildId(event.target.value)}><option value="">Perfil pessoal</option>{communities.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          {data.community && <div className="cyl-profile-community-detail"><strong>{data.community.roleName}</strong><p>{data.community.name}</p>{data.community.canManage && <a className="dashboard-button" href={`#/dashboard/${data.community.id}`}>Gerenciar servidor</a>}</div>}
          <h3>Selos verificados</h3><div className="cyl-profile-badges">{data.badges.length ? data.badges.map(b => <span className={`cyl-profile-badge badge-${b.id.toLowerCase()}`} key={b.id}><BadgeCheck size={16} aria-hidden="true" />{b.label}</span>) : <p>Seu perfil ainda não possui selos oficiais.</p>}</div>
        </div>}</fieldset>
        <div className="cyl-profile-actions"><button className="dashboard-button dashboard-button-primary" type="submit" disabled={busy}><Save size={16} aria-hidden="true" />{busy ? 'Salvando...' : 'Salvar perfil'}</button><button className="dashboard-button" type="button" disabled={busy} onClick={() => { setDraft(data.profile); setNotice(''); setEditing(false); }}>Cancelar edição</button></div>
      </form></section>}
    </div>}
  </main>;
}
