import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function TicketDialog({ title, onClose, busy = false, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    const owner = dialog.closest('.ticket-conversation');
    dialog.showModal();
    return () => { dialog.close(); if (trigger?.isConnected) trigger.focus(); else owner?.querySelector('.ticket-context-trigger:not(:disabled), .ticket-conversation-header button:not(:disabled)')?.focus(); };
  }, []);
  return <dialog ref={ref} className="ticket-dialog" aria-label={title}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (event.target === ref.current && !busy) onClose(); }}>
    <div className="ticket-dialog-content">
      <header><h2>{title}</h2><button type="button" className="ticket-icon-button" aria-label="Fechar diálogo" disabled={busy} onClick={onClose}><X size={18} /></button></header>
      {children}
    </div>
  </dialog>;
}
