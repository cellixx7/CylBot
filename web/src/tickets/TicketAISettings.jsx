const levels = [
  ['0', 'Desligada', 'A IA não gera respostas ou sugestões.'],
  ['1', 'Sugestões', 'A IA pode analisar o atendimento e sugerir ações à equipe.'],
  ['2', 'Respostas automáticas', 'A IA pode executar respostas seguras permitidas pela política.'],
  ['3', 'Autonomia limitada', 'Mantém as ações seguras disponíveis no V1; ações administrativas continuam bloqueadas.'],
];
const capabilities = ['reply', 'ask_clarifying_question', 'summarize', 'request_human', 'suggest_close'];

export default function TicketAISettings({ config, saving, error, onChange, onSave, onCancel }) {
  if (!config) return null;
  return <section className="ticket-ai-settings" aria-label="Configuração da IA">
    <h3>Configuração da IA do servidor</h3>
    <form onSubmit={event => { event.preventDefault(); onSave(); }}>
      <label><input type="checkbox" checked={config.enabled} onChange={event => onChange('enabled', event.target.checked)} /> Ativar IA</label>
      <label>Nível de autonomia<select value={config.autonomyLevel} onChange={event => onChange('autonomyLevel', Number(event.target.value))}>{levels.map(([value, label, description]) => <option key={value} value={value}>{`Nível ${value} — ${label}`}</option>)}</select></label>
      <p className="description">{levels.find(([value]) => Number(value) === config.autonomyLevel)?.[2]}</p>
      <label>Nome do assistente<input maxLength="40" value={config.assistantName} onChange={event => onChange('assistantName', event.target.value)} /></label>
      <label>Tom<input maxLength="80" value={config.tone} onChange={event => onChange('tone', event.target.value)} /></label>
      <label>Idioma<input maxLength="20" value={config.language} onChange={event => onChange('language', event.target.value)} /></label>
      <label>Contexto do servidor<textarea maxLength="2000" value={config.serverContext} onChange={event => onChange('serverContext', event.target.value)} /></label>
      <label>Instruções de suporte<textarea maxLength="2000" value={config.supportInstructions} onChange={event => onChange('supportInstructions', event.target.value)} /></label>
      <label><input type="checkbox" checked={config.humanEscalationEnabled} onChange={event => onChange('humanEscalationEnabled', event.target.checked)} /> Permitir escalonamento humano</label>
      <fieldset><legend>Capacidades permitidas</legend>{capabilities.map(capability => <label key={capability}><input type="checkbox" checked={config.capabilities.includes(capability)} onChange={event => onChange('capabilities', event.target.checked ? [...config.capabilities, capability] : config.capabilities.filter(item => item !== capability))} /> {capability}</label>)}</fieldset>
      {error && <p className="dashboard-notice" role="alert">{error}</p>}
      <div className="ticket-actions"><button type="button" className="button button-outline" disabled={saving} onClick={onCancel}>Cancelar</button><button className="button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar configuração'}</button></div>
    </form>
  </section>;
}

