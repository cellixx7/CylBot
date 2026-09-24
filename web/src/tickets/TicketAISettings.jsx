const levels = [
  ['0', 'Desligada', 'A IA não gera respostas ou sugestões.'],
  ['1', 'Sugestões', 'A IA pode analisar o atendimento e sugerir ações à equipe.'],
  ['2', 'Respostas automáticas', 'A IA pode executar respostas seguras permitidas pela política.'],
  ['3', 'Autonomia limitada', 'Mantém as ações seguras disponíveis no V1; ações administrativas continuam bloqueadas.'],
];

const capabilities = ['reply', 'ask_clarifying_question', 'summarize', 'request_human', 'suggest_close'];
const capabilityLabels = { reply: 'Responder', ask_clarifying_question: 'Pedir esclarecimentos', summarize: 'Resumir atendimento', request_human: 'Solicitar atendimento humano', suggest_close: 'Sugerir encerramento' };

export default function TicketAISettings({ config, saving, error, onChange, onSave, onCancel }) {
  if (!config) return null;
  const capabilityChange = (capability, checked) => onChange('capabilities', checked ? [...config.capabilities, capability] : config.capabilities.filter(item => item !== capability));
  return <section className="ticket-ai-settings" aria-label="Configuração da IA">
    <form onSubmit={event => { event.preventDefault(); onSave(); }}>
      <section className="ticket-ai-group" aria-labelledby="ticket-ai-general">
        <h3 id="ticket-ai-general">Geral</h3>
        <div className="ticket-ai-fields ticket-ai-fields-general">
          <label className="ticket-ai-check"><input type="checkbox" checked={config.enabled} onChange={event => onChange('enabled', event.target.checked)} /> Ativar IA</label>
          <label>Nível de autonomia<select value={config.autonomyLevel} onChange={event => onChange('autonomyLevel', Number(event.target.value))}>{levels.map(([value, label]) => <option key={value} value={value}>{`Nível ${value} — ${label}`}</option>)}</select></label>
          <label>Nome do assistente<input maxLength="40" value={config.assistantName} onChange={event => onChange('assistantName', event.target.value)} /></label>
        </div>
        <p className="description">{levels.find(([value]) => Number(value) === config.autonomyLevel)?.[2]}</p>
      </section>
      <section className="ticket-ai-group" aria-labelledby="ticket-ai-behavior"><h3 id="ticket-ai-behavior">Comportamento</h3><div className="ticket-ai-fields"><label>Tom<input maxLength="80" value={config.tone} onChange={event => onChange('tone', event.target.value)} /></label><label>Idioma<input maxLength="20" value={config.language} onChange={event => onChange('language', event.target.value)} /></label></div></section>
      <section className="ticket-ai-group" aria-labelledby="ticket-ai-context"><h3 id="ticket-ai-context">Contexto</h3><div className="ticket-ai-fields"><label>Contexto do servidor<textarea maxLength="2000" value={config.serverContext} onChange={event => onChange('serverContext', event.target.value)} /></label><label>Instruções de suporte<textarea maxLength="2000" value={config.supportInstructions} onChange={event => onChange('supportInstructions', event.target.value)} /></label></div></section>
      <section className="ticket-ai-group" aria-labelledby="ticket-ai-safety"><h3 id="ticket-ai-safety">Segurança</h3><label className="ticket-ai-check"><input type="checkbox" checked={config.humanEscalationEnabled} onChange={event => onChange('humanEscalationEnabled', event.target.checked)} /> Permitir escalonamento humano</label><fieldset className="ticket-ai-capabilities"><legend>Capacidades permitidas</legend><div>{capabilities.map(capability => <label className="ticket-ai-check" key={capability}><input type="checkbox" checked={config.capabilities.includes(capability)} onChange={event => capabilityChange(capability, event.target.checked)} /> {capabilityLabels[capability]}</label>)}</div></fieldset></section>
      {error && <p className="dashboard-notice" role="alert">{error}</p>}
      <footer className="ticket-ai-settings-actions"><button type="button" className="button button-outline" disabled={saving} onClick={onCancel}>Cancelar</button><button className="button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar configuração'}</button></footer>
    </form>
  </section>;
}
