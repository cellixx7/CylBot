import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import TicketDialog from './TicketDialog.jsx';
import { statuses } from './TicketShared.jsx';
import { emptyFilters, filterChips, periodLabels } from './ticketFilterView.js';
export default function TicketFilters({ filters, categories, assignees, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const chips = filterChips(filters, categories, assignees, statuses);
  const field = key => ({ value: draft[key], onChange: event => setDraft(previous => ({ ...previous, [key]: event.target.value })) });
  return <>
    <button type="button" className="button button-outline ticket-filter-trigger" aria-expanded={open} onClick={() => { setDraft(filters); setOpen(true); }}><SlidersHorizontal size={15} aria-hidden="true" />Filtros{chips.length > 0 && <span>{chips.length}</span>}</button>
    {chips.length > 0 && <div className="ticket-filter-chips" aria-label="Filtros ativos">{chips.map(chip => <button type="button" key={chip.key} onClick={() => onChange({ ...filters, [chip.key]: '', ...(chip.key === 'period' ? { from: '', to: '' } : {}) })} aria-label={`Remover ${chip.label}`}>{chip.label}<X size={12} aria-hidden="true" /></button>)}<button type="button" className="ticket-clear-filters" onClick={() => onChange({ ...emptyFilters })}>Limpar filtros</button></div>}
    {open && <TicketDialog title="Filtrar tickets" onClose={() => setOpen(false)}><form className="ticket-dialog-form ticket-filter-form" onSubmit={event => { event.preventDefault(); onChange(draft); setOpen(false); }}>
      <label>Status<select aria-label="Status" {...field('status')}><option value="">Todos</option>{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Categoria do ticket<select aria-label="Categoria do ticket" {...field('category')}><option value="">Todas</option>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <label>Responsável<select aria-label="Responsável" {...field('assigned')}><option value="">Todos</option><option value="unassigned">Não atribuído</option><option value="me">Eu</option>{assignees.map(person => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
      <label>Data de abertura<select aria-label="Data de abertura" {...field('period')}><option value="">Qualquer data</option>{Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {draft.period === 'custom' && <div className="ticket-date-fields"><label>Data inicial<input type="date" required={!draft.to} max={draft.to || undefined} {...field('from')} /></label><label>Data final<input type="date" required={!draft.from} min={draft.from || undefined} {...field('to')} /></label></div>}
      <div className="ticket-dialog-actions"><button type="button" className="button button-outline" onClick={() => setDraft({ ...emptyFilters })}>Limpar</button><button className="button">Aplicar filtros</button></div>
    </form></TicketDialog>}
  </>;
}
