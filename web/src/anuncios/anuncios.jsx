import { useState } from 'react';

const empty = { name: '', title: '', description: '', image: '' };
export default function Anuncios() {
  const [guildId, setGuildId] = useState('');
  const [guild, setGuild] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [editing, setEditing] = useState(null);
  const [description, setDescription] = useState('');
  const [channelId, setChannelId] = useState('');
  const [preview, setPreview] = useState(null);
  const [context, setContext] = useState('');
  const [addingContext, setAddingContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const category = categories.find(c => c.id === categoryId);

  async function request(action, body = {}) {
    const response = await fetch(`/api/announcements/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guildId: guild?.id || guildId, ...body }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
  }
  async function run(task) {
    setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function choose(id, list = categories) {
    setCategoryId(id); setDescription(list.find(c => c.id === id)?.description || '');
    setPreview(null); setEditing(null); setAddingContext(false); setContext(''); setNotice('');
  }
  async function load() {
    const data = await request('categories', { guildId });
    setGuild({ id: guildId, name: data.guildName }); setCategories(data.categories); choose(data.categories[0].id, data.categories);
  }
  async function generate(revise = false) {
    const result = await request('generate', revise ? { draftId: preview.draftId, context } : { categoryId, description });
    setPreview(result); setContext(''); setAddingContext(false);
  }
  return <main className="app-shell">
    <a className="back-link" href="#/">← Voltar ao início</a>
    <section className="intro"><p className="eyebrow">CYLBOT / ANÚNCIOS</p><h1>Seu servidor.<br /><em>Seu padrão.</em></h1><p className="description">Crie categorias, salve os padrões do servidor e revise cada anúncio antes de publicar.</p></section>
    {error && <p className="error-message" role="alert">{error}</p>}
    {notice && <p className="success-message" role="status">{notice}</p>}
    <fieldset disabled={busy} className="announcement-controls">
      <section className="workspace">
        <div className="form-panel">
          <form onSubmit={e => { e.preventDefault(); run(load); }}>
            <label>ID do servidor<input required pattern="[0-9]{17,20}" value={guildId} onChange={e => { setGuildId(e.target.value); setGuild(null); setCategories([]); setPreview(null); setEditing(null); }} placeholder="ID do servidor onde está o CylBot" /></label>
            <button className="secondary-button">Carregar servidor</button>
          </form>
          {guild && <>
            <p className="description">Padrões de {guild.name}</p>
            <label>Categoria<select value={categoryId} onChange={e => choose(e.target.value)}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <div className="preview-actions"><button className="secondary-button" onClick={() => setEditing({ ...empty })} disabled={categories.length >= 25}>Adicionar categoria</button><button className="secondary-button" onClick={() => setEditing({ ...category })}>Editar padrão</button></div>
            {editing && <form className="addition-box" onSubmit={e => { e.preventDefault(); run(async () => { const data = await request('save', { category: editing }); setCategories(data.categories); const saved = data.categories.find(c => c.id === editing.id || c.name === editing.name.trim()); choose(saved.id, data.categories); setNotice('Padrão salvo para o servidor.'); }); }}>
              <p className="description">Alterações neste padrão ficam disponíveis para todo o servidor.</p>
              {[['name', 'Nome da categoria', 100], ['title', 'Título do anúncio', 256], ['description', 'Descrição padrão', 2000], ['image', 'URL HTTPS da imagem (opcional)', 1000]].map(([key, label, max]) => <label key={key}>{label}{key === 'description' ? <textarea maxLength={max} value={editing[key]} onChange={e => setEditing({ ...editing, [key]: e.target.value })} /> : <input required={key === 'name' || key === 'title'} maxLength={max} type={key === 'image' ? 'url' : 'text'} value={editing[key]} onChange={e => setEditing({ ...editing, [key]: e.target.value })} />}</label>)}
              <div className="preview-actions"><button className="send-button">Salvar padrão</button><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancelar</button></div>
            </form>}
            {!editing && <form className="addition-box" onSubmit={e => { e.preventDefault(); run(() => generate()); }}>
              <label>Descrição do anúncio<textarea required maxLength={2000} value={description} onChange={e => { setDescription(e.target.value); setPreview(null); }} /></label>
              <button className="primary-button">Gerar prévia com IA ↗</button>
            </form>}
          </>}
        </div>
        <div className="preview-panel">
          <h2>Revise antes de publicar</h2>
          {busy && <p role="status">Processando…</p>}
          {!preview && <div className="empty-preview"><span>✦</span><p>Seu anúncio aparecerá aqui.</p><small>Selecione uma categoria e gere uma prévia.</small></div>}
          {preview && <>
            <article className="discord-embed announcement-preview"><h3>{preview.embed.title}</h3><p>{preview.embed.description}</p>{preview.embed.image && <img src={preview.embed.image.url} alt="Imagem do anúncio" />}<small>{preview.embed.footer.text}</small></article>
            <button className="secondary-button" onClick={() => setAddingContext(true)}>Adicionar Contexto</button>
            {addingContext && <form className="addition-box" onSubmit={e => { e.preventDefault(); run(() => generate(true)); }}><label>Contexto adicional<textarea required maxLength={2000} value={context} onChange={e => setContext(e.target.value)} /></label><button className="send-button">Atualizar prévia</button></form>}
            <form className="addition-box" onSubmit={e => { e.preventDefault(); run(async () => { await request('send', { draftId: preview.draftId, channelId }); setPreview(null); setNotice('Anúncio enviado com sucesso.'); }); }}><label>ID do canal de destino<input required pattern="[0-9]{17,20}" value={channelId} onChange={e => setChannelId(e.target.value)} /></label><button className="primary-button" disabled={addingContext}>Confirmar envio ↗</button></form>
          </>}
        </div>
      </section>
    </fieldset>
  </main>;
}
