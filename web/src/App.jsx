import { useState } from 'react';

const initialForm = {
  outputType: 'content',
  idea: '',
  targetCharacters: 200,
  channelId: '',
};

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [currentText, setCurrentText] = useState('');
  const [generated, setGenerated] = useState(null);
  const [additionalContext, setAdditionalContext] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function generate(context = '') {
    setLoading(true);
    setError('');
    setSent(false);

    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputType: form.outputType,
          idea: form.idea,
          originalContext: form.idea,
          currentText,
          additionalContext: context,
          targetCharacters: Number(form.targetCharacters),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível gerar a mensagem.');
      setGenerated(data.generated);
      setCurrentText(form.outputType === 'content' ? data.generated.content : data.generated.description);
      setIsAdding(false);
      setAdditionalContext('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/discord/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: form.channelId, outputType: form.outputType, generated }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a mensagem.');
      setSent(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  const canGenerate = form.idea.trim() && Number(form.targetCharacters) >= 20 && !loading;

  return (
    <main className="app-shell">
      <section className="intro">
        <p className="eyebrow">CYLBOT / LABORATÓRIO DE TEXTO</p>
        <h1>Escreva uma ideia.<br /><em>Publique melhor.</em></h1>
        <p className="description">Um espaço de teste para transformar rascunhos em mensagens prontas para Discord.</p>
      </section>

      <section className="workspace" aria-label="Criador de mensagens">
        <div className="form-panel">
          <div className="section-heading">
            <span className="step">01</span>
            <div><p className="label">Rascunho</p><h2>Comece pela intenção</h2></div>
          </div>

          <label>Formato
            <select name="outputType" value={form.outputType} onChange={updateField} disabled={loading}>
              <option value="content">Content</option>
              <option value="embed">Embed</option>
            </select>
          </label>
          <label>Ideia inicial
            <textarea name="idea" value={form.idea} onChange={updateField} maxLength="2000" placeholder="Ex.: avisar que haverá manutenção no bot" disabled={loading} />
            <span className="counter">{form.idea.length}/2000</span>
          </label>
          <div className="split-fields">
            <label>Caracteres aproximados
              <input name="targetCharacters" type="number" min="20" max="2000" value={form.targetCharacters} onChange={updateField} disabled={loading} />
            </label>
            <label>Channel ID
              <input name="channelId" value={form.channelId} onChange={updateField} placeholder="ID do canal Discord" maxLength="20" disabled={loading} />
            </label>
          </div>
          <button className="primary-button" type="button" onClick={() => generate()} disabled={!canGenerate}>
            {loading ? 'Gerando...' : 'Gerar com IA'} <span>↗</span>
          </button>
          {error && <p className="error-message" role="alert">{error}</p>}
        </div>

        <div className="preview-panel">
          <div className="section-heading preview-heading">
            <span className="step">02</span>
            <div><p className="label">Prévia</p><h2>Revise antes de enviar</h2></div>
            {generated && <span className="status-dot">● pronta</span>}
          </div>
          {!generated && !loading && <div className="empty-preview"><span>✦</span><p>Sua mensagem aparecerá aqui.</p><small>Ajuste a ideia e peça uma primeira versão.</small></div>}
          {loading && <div className="empty-preview loading-preview"><span>◌</span><p>Lapidando sua mensagem...</p><small>A IA está preparando uma versão para revisão.</small></div>}
          {generated && !loading && <Preview type={form.outputType} generated={generated} />}

          {generated && !loading && !sent && !isAdding && (
            <div className="preview-actions">
              <button className="send-button" type="button" onClick={sendMessage} disabled={loading || !form.channelId}>Enviar <span>↗</span></button>
              <button className="secondary-button" type="button" onClick={() => setIsAdding(true)} disabled={loading}>Adicionar mais</button>
              {!form.channelId && <small className="hint">Informe o Channel ID para enviar.</small>}
            </div>
          )}
          {isAdding && !sent && (
            <div className="addition-box">
              <label>Contexto adicional
                <textarea value={additionalContext} onChange={(event) => setAdditionalContext(event.target.value)} maxLength="2000" placeholder="Ex.: inclua o horário e explique o motivo da manutenção." autoFocus />
              </label>
              <div className="preview-actions inline-actions">
                <button className="send-button" type="button" onClick={() => generate(additionalContext)} disabled={!additionalContext.trim() || loading}>Gerar nova versão ↗</button>
                <button className="secondary-button" type="button" onClick={() => setIsAdding(false)} disabled={loading}>Cancelar</button>
              </div>
            </div>
          )}
          {sent && <div className="success-message">✓ Mensagem enviada com sucesso.</div>}
        </div>
      </section>
    </main>
  );
}

function Preview({ type, generated }) {
  if (type === 'content') {
    return <article className="discord-content"><span className="discord-avatar">C</span><div><strong>CylBot</strong><span className="bot-tag"> APP</span><p>{renderMarkdown(generated.content)}</p></div></article>;
  }

  return <article className="discord-embed">{generated.title && <h3>{generated.title}</h3>}<p>{renderMarkdown(generated.description)}</p>{generated.fields?.map((field) => <div className="embed-field" key={`${field.name}-${field.value}`}><strong>{field.name}</strong><span>{field.value}</span></div>)}</article>;
}

function renderMarkdown(text) {
  return text.split('\n').map((line, index) => <span key={`${line}-${index}`}>{line}<br /></span>);
}