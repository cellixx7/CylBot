import { useEffect, useMemo, useState } from 'react';
import { Bot, Eye, LoaderCircle, RotateCcw, Send, Sparkles } from 'lucide-react';
import { generateAnnouncement, getAnnouncementWorkspace, publishAnnouncement, suggestAnnouncement } from './announcementsApi.js';
import './announcements.css';

const initialForm = { type: 'NOTICE', title: '', content: '', channelId: '', context: '', useAI: true, communityVisible: false };
const typeLabel = type => type === 'UPDATE' ? 'Atualização' : 'Aviso';
const formatDate = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';

export default function AnnouncementsWorkspace({ guild, requireRelogin }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [draft, setDraft] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const selectedChannel = useMemo(() => data?.channels?.find(channel => channel.id === form.channelId), [data, form.channelId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setAccessDenied(false);
    getAnnouncementWorkspace(guild.id, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setData(result);
      setForm(previous => ({ ...previous, channelId: previous.channelId || result.channels?.find(channel => channel.type === previous.type)?.id || '' }));
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setError(reason.message); setAccessDenied(reason.status === 403);
      if (reason.status === 401) requireRelogin();
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [guild.id, requireRelogin]);

  const change = (key, value) => { setForm(previous => ({ ...previous, [key]: value })); if (key !== 'communityVisible') setDraft(null); };
  const dirty = Boolean(form.title || form.content || form.context || draft || suggestion);
  function reset() {
    if (dirty && !window.confirm('Limpar o título, o conteúdo e o contexto desta publicação?')) return;
    setForm(previous => ({ ...previous, title: '', content: '', context: '', useAI: initialForm.useAI })); setDraft(null); setSuggestion(null); setError('');
  }
  function switchType(type) {
    if (type === form.type) return;
    if (dirty && !window.confirm('Trocar o tipo descarta a publicação atual. Continuar?')) return;
    setForm(previous => ({ ...initialForm, type, channelId: previous.channelId })); setDraft(null); setSuggestion(null); setError('');
  }
  async function createSuggestion() {
    setBusy(true); setError('');
    try { const result = await suggestAnnouncement({ guildId: guild.id, type: form.type, intent: form.context, context: form.content }); setSuggestion(result.suggestion); }
    catch (reason) { setError(reason.message); if (reason.status === 401) requireRelogin(); }
    finally { setBusy(false); }
  }
  async function createPreview(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { setDraft(await generateAnnouncement({ guildId: guild.id, ...form, useAI: false })); }
    catch (reason) { setError(reason.message); if (reason.status === 401) requireRelogin(); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!draft) return;
    setBusy(true); setError('');
    try {
      const result = await publishAnnouncement({ guildId: guild.id, draftId: draft.draftId, channelId: form.channelId, type: form.type, communityVisible: form.communityVisible });
      setData(previous => ({ ...previous, recent: [result.publication, ...(previous.recent || [])].filter(Boolean) }));
      setDraft(null); setForm(previous => ({ ...initialForm, channelId: previous.channelId }));
    } catch (reason) { setError(reason.message); if (reason.status === 401) requireRelogin(); }
    finally { setBusy(false); }
  }

  if (accessDenied) return <section className="announcements-workspace"><h1>Avisos e atualizações</h1><p className="dashboard-notice" role="alert">{error}</p></section>;

  return <section className="announcements-workspace" aria-labelledby="announcements-title">
    <header className="announcements-heading"><div><p className="dashboard-kicker">COMUNICAÇÃO OFICIAL</p><h1 id="announcements-title">Avisos e atualizações</h1><p>Crie, revise e publique comunicados oficiais para a comunidade do {guild.name}.</p></div></header>
    <div className="announcement-tabs" role="tablist" aria-label="Tipo de publicação"><button type="button" role="tab" aria-selected={form.type === 'NOTICE'} onClick={() => switchType('NOTICE')}>Avisos</button><button type="button" role="tab" aria-selected={form.type === 'UPDATE'} onClick={() => switchType('UPDATE')}>Atualizações</button></div>
    {loading ? <div className="dashboard-notice" role="status">Carregando configurações de publicação...</div> : <>
      {error && <p className="dashboard-notice dashboard-error" role="alert">{error}</p>}
      {!data?.channels?.length && <p className="dashboard-notice" role="alert">O CYL não possui um canal de texto disponível para publicar neste servidor.</p>}
      <div className="announcement-studio">
        <form className="announcement-editor" onSubmit={createPreview}>
          <div className="announcement-panel-heading"><div><span>Editor</span><strong>{typeLabel(form.type)}</strong></div><button className="dashboard-button dashboard-button-secondary" type="button" onClick={reset} disabled={busy || !dirty}><RotateCcw size={16} aria-hidden="true" />Limpar texto</button></div>
          <label>Título<input value={form.title} maxLength={256} onChange={event => change('title', event.target.value)} placeholder={form.type === 'NOTICE' ? 'Ex.: Manutenção programada' : 'Ex.: Nova central de Tickets'} required disabled={busy} /></label>
          <label>Conteúdo<textarea value={form.content} maxLength={4000} onChange={event => change('content', event.target.value)} placeholder="Escreva os fatos, contexto e orientações que a comunidade precisa receber." required disabled={busy} /></label>
          <div className="announcement-ai"><div><Bot size={17} aria-hidden="true" /><strong>Assistência CYL</strong></div><button className="dashboard-button" type="button" disabled={busy || !form.context.trim()} onClick={createSuggestion}><Sparkles size={16} />Criar com IA</button></div>
          <label>O que você quer comunicar? <input value={form.context} maxLength={2000} onChange={event => change('context', event.target.value)} placeholder="Ex.: manutenção sexta às 22h, por cerca de uma hora." disabled={busy} /></label>
          {suggestion && <div className="announcement-suggestion"><strong>Sugestão da IA</strong><h3>{suggestion.title}</h3><p>{suggestion.content}</p><div><button className="dashboard-button dashboard-button-primary" type="button" onClick={() => { setForm(previous => ({ ...previous, title: suggestion.title, content: suggestion.content, useAI: false })); setSuggestion(null); }}>Aplicar</button><button className="dashboard-button" type="button" onClick={() => setSuggestion(null)}>Descartar</button></div></div>}
          <label>Destino<select value={form.channelId} onChange={event => {
            const channelId = event.target.value;
            const channel = data?.channels?.find(item => item.id === channelId);
            setForm(previous => ({ ...previous, channelId, communityVisible: channel?.communityVisible ? previous.communityVisible : false }));
            setDraft(null);
          }} disabled={busy || !data?.channels?.length} required><option value="">Canal oficial não configurado</option>{data?.channels?.filter(channel => channel.type === form.type).map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select></label>
          <label className="announcement-switch"><input type="checkbox" checked={form.communityVisible && Boolean(selectedChannel?.communityVisible)} onChange={event => change('communityVisible', event.target.checked)} disabled={busy || !selectedChannel?.communityVisible} />Exibir na página da comunidade</label>
          <button className="dashboard-button dashboard-button-primary" disabled={busy || !form.channelId}>{busy ? <LoaderCircle className="is-spinning" size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}{draft ? 'Atualizar prévia' : 'Gerar prévia'}</button>
        </form>
        <aside className="announcement-preview-panel" aria-live="polite"><div className="announcement-panel-heading"><div><span>Prévia</span><strong>Discord</strong></div><Eye size={18} aria-hidden="true" /></div>{draft ? <article className={`announcement-discord-card is-${draft.type.toLowerCase()}`}><p className="announcement-discord-tag">{typeLabel(draft.type)}</p><h2>{draft.title}</h2><p>{draft.content}</p><footer>{guild.name} · #{selectedChannel?.name || 'destino'}</footer></article> : <div className="announcement-empty-preview"><Sparkles size={26} aria-hidden="true" /><strong>Sua prévia aparecerá aqui</strong><p>Use o editor para criar um aviso ou atualização antes de publicar.</p></div>}{draft && <button className="dashboard-button dashboard-button-primary announcement-publish" type="button" disabled={busy} onClick={publish}>{busy ? <LoaderCircle className="is-spinning" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}Publicar em #{selectedChannel?.name || 'canal'}</button>}<p className="announcement-community-note">{form.communityVisible ? 'Também será marcado para a página da comunidade.' : 'Disponível apenas no Discord do servidor.'}</p></aside>
      </div>
      <section className="announcement-recent" aria-labelledby="announcement-recent-title"><div className="server-section-heading"><h2 id="announcement-recent-title">Publicações recentes</h2><span>{(data?.recent || []).filter(item => item.type === form.type).length} publicações</span></div>{(data?.recent || []).filter(item => item.type === form.type).length ? <ol>{data.recent.filter(item => item.type === form.type).map(item => <li key={item.id}><span className={`announcement-type is-${item.type.toLowerCase()}`}>{typeLabel(item.type)}</span><div><strong>{item.title}</strong><p>{item.content}</p><small>Publicado · #{item.channelName || 'canal'} · {formatDate(item.publishedAt || item.createdAt)}</small></div></li>)}</ol> : <p className="dashboard-muted">As publicações enviadas por esta área aparecerão aqui.</p>}</section>
    </>}
  </section>;
}
