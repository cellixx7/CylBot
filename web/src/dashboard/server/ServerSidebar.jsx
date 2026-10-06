import { useEffect, useState } from 'react';
import { Bell, Bot, ChevronDown, LayoutDashboard, Menu, Palette, Settings, ShieldCheck, Ticket, Zap } from 'lucide-react';
import { serverSections } from './workspaceAccess.js';

const icons = { overview: LayoutDashboard, tickets: Ticket, announcements: Bell, automation: Zap,
  intelligence: Bot, personalization: Palette, access: ShieldCheck, settings: Settings };

export default function ServerSidebar({ guild, section }) {
  const [open, setOpen] = useState(false);
  const sections = serverSections(guild);
  const groups = [...new Set(sections.map(item => item.group))];
  useEffect(() => setOpen(false), [section]);

  return <aside className={`server-sidebar${open ? ' is-open' : ''}`} onKeyDown={event => {
    if (event.key === 'Escape') {
      setOpen(false);
      event.currentTarget.querySelector('button')?.focus();
    }
  }}>
    <button className="dashboard-button dashboard-button-secondary server-menu-trigger" type="button"
      aria-expanded={open} aria-controls="server-navigation" onClick={() => setOpen(value => !value)}>
      <Menu size={16} aria-hidden="true" /> Menu do servidor <ChevronDown size={15} aria-hidden="true" />
    </button>
    <nav id="server-navigation" className="server-navigation" aria-label="Navegação do servidor">
      {groups.map(group => <div className="server-nav-group" key={group}>
        <p>{group}</p>
        <ul>{sections.filter(item => item.group === group).map(item => {
          const Icon = icons[item.id];
          return <li key={item.id}>{item.implemented
            ? <a className="server-nav-item" href={`#/dashboard/${guild.id}${item.path}`} aria-current={section === item.id ? 'page' : undefined} onClick={() => setOpen(false)}><Icon size={16} aria-hidden="true" /><span>{item.label}</span></a>
            : <span className="server-nav-item is-unavailable" aria-disabled="true"><Icon size={16} aria-hidden="true" /><span>{item.label}</span><small>Em breve</small></span>}
          </li>;
        })}</ul>
      </div>)}
    </nav>
  </aside>;
}
