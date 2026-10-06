import { useState } from 'react';
import { Wrench } from 'lucide-react';
import TicketDialog from './TicketDialog.jsx';
import { getTicketTools, runTicketTool } from './ticketsApi.js';

export default function TicketTools({ guildId, ticketId, available, requireRelogin }) {
  const [open, setOpen] = useState(false);
  const [tools, setTools] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [action, setAction] = useState('');
  const [roleId, setRoleId] = useState('');
  const [duration, setDuration] = useState('300000');
  const [minutes, setMinutes] = useState('60');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  if (!available) return null;
  async function show() {
    setOpen(true); setBusy(true); setError(''); setTools(null); setAction(''); setConfirmed(false); setReason('');
    try {
      const response = await getTicketTools(guildId, ticketId);
      setTools(response.tools); setRoleId(response.tools.roles?.[0]?.id || '');
    } catch (failure) { if (failure.reloginRequired) requireRelogin(); setError(failure.message); }
    finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !confirmed) return;
    setBusy(true); setError('');
    try {
      await runTicketTool(guildId, ticketId, action, { reason, confirm: confirmed,
        ...(['add-role', 'remove-role'].includes(action) ? { roleId } : {}),
        ...(action === 'timeout' ? { durationMs: duration === 'custom' ? Number(minutes) * 60000 : Number(duration) } : {}) });
      setResult('Ação confirmada pelo Discord e registrada no atendimento.'); setOpen(false);
    } catch (failure) { if (failure.reloginRequired) requireRelogin(); setError(failure.message); }
    finally { setBusy(false); }
  }
  const roles = tools?.roles?.filter(role => role.assigned === (action === 'remove-role')) || [];
  return <>
    <button type="button" className="button button-outline" onClick={show}><Wrench size={14} aria-hidden="true" />Ferramentas</button>
    {result && <span className="ticket-tool-result" role="status">{result}</span>}
    {open && <TicketDialog title="Ferramentas do atendente" busy={busy} onClose={() => setOpen(false)}>
      {busy && !tools && <p role="status">Verificando permissões do Discord...</p>}
      {error && <p role="alert">{error}</p>}
      {tools && <form className="ticket-dialog-form" onSubmit={submit}>
        <p>Usuário do ticket: <strong>{tools.target?.name || 'Não está mais no servidor'}</strong></p>
        <label>Ação<select aria-label="Ação" required value={action} disabled={busy} onChange={event => { setAction(event.target.value); setConfirmed(false); setRoleId(''); }}>
          <option value="">Selecionar ferramenta</option>
          {tools.canManageRoles && <><option value="add-role">Adicionar cargo</option><option value="remove-role">Remover cargo</option></>}
          {tools.canTimeout && <option value="timeout">Dar timeout</option>}
          {tools.canRemoveTimeout && <option value="remove-timeout">Remover timeout</option>}
          {tools.canBan && <option value="ban">Banir usuário</option>}
        </select></label>
        {!tools.canManageRoles && !tools.canTimeout && !tools.canBan && <p>Nenhuma ferramenta disponível para este usuário com as permissões e hierarquia atuais.</p>}
        {['add-role', 'remove-role'].includes(action) && <label>Cargo<select required value={roleId} disabled={busy} onChange={event => setRoleId(event.target.value)}><option value="">Selecionar cargo</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select>{!roles.length && <small>Nenhum cargo disponível para esta operação.</small>}</label>}
        {action === 'timeout' && <><label>Duração<select value={duration} disabled={busy} onChange={event => setDuration(event.target.value)}><option value="300000">5 minutos</option><option value="600000">10 minutos</option><option value="3600000">1 hora</option><option value="86400000">1 dia</option><option value="custom">Personalizado</option></select></label>
          {duration === 'custom' && <label>Minutos (até 28 dias)<input type="number" required min="1" max={Math.floor(tools.maxTimeoutMs / 60000)} value={minutes} disabled={busy} onChange={event => setMinutes(event.target.value)} /></label>}</>}
        {action && <><label>Motivo<textarea required maxLength={400} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
          {action === 'ban' && <p className="ticket-danger-text">Banir {tools.target?.name} removerá o acesso ao servidor. As mensagens existentes serão preservadas.</p>}
          <label className="ticket-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Confirmo esta ação sobre {tools.target?.name}.</label>
          <button className={`button ${action === 'ban' ? 'ticket-danger-button' : ''}`} disabled={busy || !confirmed || !reason.trim()}>{busy ? 'Executando...' : action === 'ban' ? `Banir ${tools.target?.name}` : 'Confirmar ação'}</button></>}
      </form>}
    </TicketDialog>}
  </>;
}
