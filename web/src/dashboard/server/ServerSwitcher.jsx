import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { GuildIcon } from '../GuildCard.jsx';
import { accessibleGuilds, serverHref } from './workspaceAccess.js';

export default function ServerSwitcher({ guild, guilds }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const available = accessibleGuilds(guilds);
  const searchable = available.length > 8;
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const filtered = available.filter(item => !searchable || !normalized || item.name.toLocaleLowerCase('pt-BR').includes(normalized));
  const close = (restoreFocus = false) => {
    setOpen(false);
    setQuery('');
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    (dialog?.querySelector('input') || dialog?.querySelector('[aria-current]') || dialog?.querySelector('a'))?.focus();
    const outside = event => { if (!wrapRef.current?.contains(event.target)) close(); };
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close(true);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function moveFocus(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if (event.target.tagName === 'INPUT' && ['Home', 'End'].includes(event.key)) return;
    const links = [...dialogRef.current.querySelectorAll('.server-switcher-option')];
    if (!links.length) return;
    event.preventDefault();
    const current = links.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1
      : current < 0 ? (event.key === 'ArrowUp' ? links.length - 1 : 0)
        : (current + (event.key === 'ArrowUp' ? -1 : 1) + links.length) % links.length;
    links[next].focus();
  }

  return <div className="server-switcher" ref={wrapRef} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close();
  }}>
    <button ref={triggerRef} type="button" className="dashboard-button dashboard-button-secondary server-switcher-trigger"
      aria-expanded={open} aria-haspopup="dialog" aria-controls="server-switcher-dialog" onClick={() => open ? close() : setOpen(true)}>
      Trocar servidor <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <div id="server-switcher-dialog" className="server-switcher-dialog" role="dialog" aria-label="Trocar servidor" ref={dialogRef} onKeyDown={moveFocus}>
      <div className="server-switcher-heading"><strong>Seus servidores</strong><button className="dashboard-icon-button" type="button" aria-label="Fechar troca de servidor" onClick={() => close(true)}><X size={16} aria-hidden="true" /></button></div>
      {searchable && <label className="dashboard-search server-switcher-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Pesquisar no seletor de servidores</span><input type="search" placeholder="Pesquisar servidor" value={query} onChange={event => setQuery(event.target.value)} /></label>}
      <ul className="server-switcher-options">
        {filtered.map(item => <li key={item.id}><a className="server-switcher-option" href={serverHref(item)}
          aria-current={item.id === guild.id ? 'true' : undefined} onClick={() => close()}>
          <GuildIcon key={item.id} guild={item} /><span><strong>{item.name}</strong><small>{item.canManage ? 'Administrador' : 'Tickets'}</small></span>
          {item.id === guild.id && <Check size={15} aria-hidden="true" />}
        </a></li>)}
      </ul>
      {!filtered.length && <p className="server-switcher-empty" role="status">Nenhum servidor corresponde à busca.</p>}
    </div>}
  </div>;
}
