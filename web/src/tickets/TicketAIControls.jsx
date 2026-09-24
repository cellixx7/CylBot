import { ticketAIControlsEnabled, ticketAIStatusText } from './ticketAIView.js';

const actionLabels = {
  REPLY: 'Responder',
  ASK_CLARIFICATION: 'Pedir esclarecimento',
  SUMMARIZE: 'Resumir atendimento',
  ESCALATE_TO_HUMAN: 'Encaminhar para humano',
  SUGGEST_CLOSE: 'Sugerir encerramento',
  NO_ACTION: 'Nenhuma ação sugerida',
};

export default function TicketAIControls({ status, config, active, busy, result, error, onSuggest, onPause, onResume, onConfigure }) {
  if (!status) return null;
  if (!status.available) return <section className="ticket-ai" aria-label="Assistente IA"><h3>Assistente IA</h3><p>IA de tickets indisponível para este servidor.</p>{status.canConfigure && <button className="ticket-ai-configure" disabled={Boolean(busy)} onClick={onConfigure}>Configurar IA do servidor</button>}{error && <p className="dashboard-notice" role="alert">{error}</p>}</section>;
  const state = ticketAIStatusText(status);
  return <section className="ticket-ai" aria-label="Assistente IA">
    <div><h3>Assistente IA</h3><p>{status.assistantName ? `${status.assistantName} · ` : ''}{state}{config ? ` · ${config.capabilities.length} capacidades` : ''}</p></div>
    {ticketAIControlsEnabled(status, active) && <div className="ticket-actions">
      {status.canGenerateSuggestion && <button className="button button-outline" disabled={Boolean(busy)} onClick={onSuggest}>{busy === 'suggest' ? 'Analisando...' : 'Gerar sugestão'}</button>}
      {status.canPause && <button className="button button-outline" disabled={Boolean(busy)} onClick={onPause}>{busy === 'pause' ? 'Pausando...' : 'Pausar IA'}</button>}
      {status.canResume && <button className="button button-outline" disabled={Boolean(busy)} onClick={onResume}>{busy === 'resume' ? 'Retomando...' : 'Retomar IA'}</button>}
    </div>}
    {status.canConfigure && <button type="button" className="ticket-ai-configure" disabled={Boolean(busy)} onClick={onConfigure}>Configurações da IA ›</button>}
    {error && <p className="dashboard-notice" role="alert">{error}</p>}
    {result?.proposal && <div className="ticket-ai-suggestion"><strong>Sugestão da IA</strong><p>{result.proposal.message || 'Nenhuma sugestão para este atendimento.'}</p><p>Ação: {actionLabels[result.proposal.action] || 'Nenhuma ação sugerida'} · Confiança: {Math.round((result.proposal.confidence || 0) * 100)}%</p></div>}
  </section>;
}



