import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import logoUrl from '../assets/brand/cyl-logo-white.png';
import onlineUrl from '../assets/brand/cyl-online.svg';
import { discordCommunityUrl, discordInstallUrl } from '../lib/discordLinks.js';
import './header.css';

const communityLink = { label: 'Comunidade', section: 'comunidade', tooltip: 'Conheça a comunidade Cyl' };
const premiumLink = { label: 'Premium', section: 'premium', tooltip: 'Saiba mais sobre a nossa melhor versão' };
const resourcesLink = { label: 'Recursos', section: 'recursos', tooltip: 'Veja os recursos do CYL' };
const discordLink = { label: 'Discord', href: discordCommunityUrl || discordInstallUrl, tooltip: 'Adicione o Cyl' };

function UserAvatar({ user }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const name = user.displayName || user.username || 'Usuário';
  const words = name.trim().split(/\s+/);
  const initials = (words.length > 1
    ? `${Array.from(words[0])[0]}${Array.from(words.at(-1))[0]}`
    : Array.from(words[0]).slice(0, 2).join('')).toLocaleUpperCase('pt-BR');

  return (
    <span className="cyl-avatar" aria-hidden="true">
      {user.avatarUrl && failedUrl !== user.avatarUrl
        ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(user.avatarUrl)} />
        : <span>{initials}</span>}
    </span>
  );
}

function LandingLink({ link, availableSections, onSection, onSelect, menu = false, className = '' }) {
  const available = link.section ? availableSections[link.section] : Boolean(link.href);
  const tooltipClass = menu ? className : `${className} cyl-nav-tooltip`.trim();
  const props = {
    className: tooltipClass,
    role: menu ? 'menuitem' : undefined,
    tabIndex: menu ? -1 : undefined,
    'data-tooltip': menu ? undefined : link.tooltip,
    'aria-description': link.tooltip,
  };
  if (!available) {
    return <span {...props} aria-disabled="true" aria-label={`${link.label} — em breve`}>{link.label}</span>;
  }

  return (
    <a {...props} href={link.href || `#/?section=${link.section}`} onClick={event => {
      if (link.section) {
        event.preventDefault();
        onSection(link.section);
      } else {
        onSelect();
      }
    }}>{link.label}</a>
  );
}

function LandingHeader({ auth, currentPath }) {
  const [openMenu, setOpenMenu] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [availableSections, setAvailableSections] = useState({});
  const headerRef = useRef(null);
  const panelRef = useRef(null);
  const userTriggerRef = useRef(null);
  const mobileTriggerRef = useRef(null);
  const focusLast = useRef(false);
  const authenticated = auth.status === 'authenticated' && Boolean(auth.user);
  const leftLinks = [
    ...(authenticated ? [{ label: 'Dashboard', href: '#/dashboard', tooltip: 'Acessar painel de servidores' }] : [resourcesLink]),
    communityLink,
  ];
  const rightLinks = [premiumLink, discordLink];
  const mobileLinks = [...leftLinks, ...rightLinks];

  function closeMenu(restoreFocus = false) {
    if (restoreFocus) (openMenu === 'user' ? userTriggerRef : mobileTriggerRef).current?.focus();
    setOpenMenu(null);
  }

  function toggleMenu(name, last = false) {
    focusLast.current = last;
    setOpenMenu(current => current === name ? null : name);
  }

  useEffect(() => {
    const updateScroll = () => setScrolled(window.scrollY > 24);
    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });
    return () => window.removeEventListener('scroll', updateScroll);
  }, []);

  useEffect(() => {
    // Home is currently empty. Enable anchors when real sections are mounted.
    const home = document.querySelector('.home-page');
    const updateSections = () => setAvailableSections(Object.fromEntries(
      [communityLink, resourcesLink, premiumLink].map(link => [link.section, home ? Boolean(home.querySelector(`#${link.section}`)) : true]),
    ));
    updateSections();
    const observer = new MutationObserver(updateSections);
    if (home) observer.observe(home, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 740px)');
    const closeOnResize = () => setOpenMenu(null);
    media.addEventListener('change', closeOnResize);
    return () => media.removeEventListener('change', closeOnResize);
  }, []);

  useEffect(() => {
    if (!openMenu) return undefined;
    const trigger = (openMenu === 'user' ? userTriggerRef : mobileTriggerRef).current;
    const frame = requestAnimationFrame(() => {
      const items = panelRef.current?.querySelectorAll('[role="menuitem"]');
      (focusLast.current ? items?.[items.length - 1] : items?.[0])?.focus();
    });
    const dismissOutside = event => {
      if (!panelRef.current?.contains(event.target) && !trigger?.contains(event.target)) setOpenMenu(null);
    };
    const dismissEscape = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpenMenu(null);
        trigger?.focus();
      }
    };
    const dismissRoute = () => setOpenMenu(null);
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    document.addEventListener('keydown', dismissEscape);
    window.addEventListener('hashchange', dismissRoute);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      document.removeEventListener('keydown', dismissEscape);
      window.removeEventListener('hashchange', dismissRoute);
    };
  }, [openMenu]);

  function menuKeyDown(event) {
    const items = [...panelRef.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    const nextIndex = { ArrowDown: (index + 1) % items.length, ArrowUp: (index - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[event.key];
    if (nextIndex !== undefined) {
      event.preventDefault();
      items[nextIndex].focus();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const trigger = (openMenu === 'user' ? userTriggerRef : mobileTriggerRef).current;
      const focusable = [...document.querySelectorAll('a[href], button:not(:disabled), [tabindex="0"]')]
        .filter(element => element.getClientRects().length && !panelRef.current.contains(element));
      const next = focusable[focusable.indexOf(trigger) + 1];
      (event.shiftKey ? trigger : next || trigger)?.focus();
      setOpenMenu(null);
    }
  }

  function triggerKeyDown(event, name) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusLast.current = event.key === 'ArrowUp';
      setOpenMenu(name);
    }
  }

  function scrollToSection(id) {
    const section = document.getElementById(id);
    closeMenu();
    if (!section) {
      window.location.hash = `#/?section=${id}`;
      return;
    }
    const top = Math.max(0, window.scrollY + section.getBoundingClientRect().top - headerRef.current.getBoundingClientRect().bottom - 24);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top, behavior: reducedMotion ? 'instant' : 'smooth' });
    if (!section.hasAttribute('tabindex')) {
      section.setAttribute('tabindex', '-1');
      section.addEventListener('blur', () => section.removeAttribute('tabindex'), { once: true });
    }
    section.focus({ preventScroll: true });
  }

  const linkProps = { availableSections, onSection: scrollToSection, onSelect: () => closeMenu() };

  return (
    <header ref={headerRef} className={`cyl-header${scrolled ? ' is-scrolled' : ''}`}>
      <button ref={mobileTriggerRef} className="cyl-mobile-trigger" type="button" aria-label="Menu de navegação"
        aria-haspopup="menu" aria-expanded={openMenu === 'mobile'} aria-controls="cyl-mobile-menu"
        onClick={() => toggleMenu('mobile')} onKeyDown={event => triggerKeyDown(event, 'mobile')}>
        {openMenu === 'mobile' ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
      <nav className="cyl-header-left" aria-label="Conheça o CYL">
        {leftLinks.map(link => <LandingLink key={link.label} link={link} {...linkProps}
          className={link.href === '#/dashboard' && currentPath === '/dashboard' ? 'is-current' : ''} />)}
      </nav>
      <a className="cyl-header-logo" href="#/" aria-label="CYL — início" aria-describedby="cyl-home-tooltip"
        onClick={() => { closeMenu(); window.scrollTo({ top: 0, behavior: 'instant' }); }}>
        <img src={logoUrl} alt="" width="98" height="98" />
        <span id="cyl-home-tooltip" className="cyl-header-tooltip" role="tooltip">Voltar do início</span>
      </a>
      <div className="cyl-header-right">
        <nav className="cyl-header-secondary" aria-label="Premium e Discord">
          {rightLinks.map(link => <LandingLink key={link.label} link={link} {...linkProps} />)}
        </nav>
        <div className="cyl-header-auth">
          {authenticated ? (
            <button ref={userTriggerRef} className="cyl-user-trigger" type="button"
              aria-label={`Menu de ${auth.user.displayName || auth.user.username || 'usuário'}`}
              aria-haspopup="menu" aria-expanded={openMenu === 'user'} aria-controls="cyl-user-menu"
              disabled={auth.loggingOut} aria-busy={auth.loggingOut}
              onClick={() => toggleMenu('user')} onKeyDown={event => triggerKeyDown(event, 'user')}>
              <UserAvatar user={auth.user} />
              <img className="cyl-online" src={onlineUrl} alt="" width="10" height="10" />
            </button>
          ) : auth.status === 'loading' ? (
            <span className="cyl-session-loading" role="status" aria-label="Verificando sessão"><span className="session-indicator" /></span>
          ) : auth.status === 'error' ? (
            <button className="cyl-header-login" type="button" onClick={auth.retry} title="Não foi possível verificar a sessão. Tentar novamente.">Verificar</button>
          ) : (
            <a className="cyl-header-login" href="/api/auth/discord">Entrar</a>
          )}
          {openMenu === 'user' && authenticated && (
            <div ref={panelRef} className="cyl-user-panel cyl-header-panel" onKeyDown={menuKeyDown}>
              <div className="cyl-user-identity">
                <UserAvatar user={auth.user} />
                <div><strong title={auth.user.displayName || auth.user.username}>{auth.user.displayName || auth.user.username}</strong>
                  <small title={auth.user.username}>{auth.user.username ? `@${auth.user.username}` : 'Conta Discord'}</small></div>
              </div>
              <div id="cyl-user-menu" role="menu" aria-label="Minha conta">
                <a role="menuitem" tabIndex={-1} href="#/dashboard" onClick={() => closeMenu(true)}>Dashboard</a>
                <a role="menuitem" tabIndex={-1} href="#/profile" onClick={() => closeMenu(true)}>Perfil</a>
                <LandingLink link={premiumLink} {...linkProps} menu className="cyl-menu-premium" />
                <span role="menuitem" tabIndex={-1} aria-disabled="true" title="Em breve">Configurações <small>Em breve</small></span>
                <div className="cyl-menu-divider" role="separator" />
                <button role="menuitem" tabIndex={-1} className="cyl-menu-logout" type="button"
                  onClick={() => { closeMenu(true); auth.logout(); }} disabled={auth.loggingOut} aria-busy={auth.loggingOut}>
                  {auth.loggingOut ? 'Saindo...' : 'Sair'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {openMenu === 'mobile' && (
        <nav ref={panelRef} id="cyl-mobile-menu" className="cyl-mobile-panel cyl-header-panel" role="menu" aria-label="Navegação da landing" onKeyDown={menuKeyDown}>
          {mobileLinks.map(link => <LandingLink key={link.label} link={link} {...linkProps} menu />)}
        </nav>
      )}
    </header>
  );
}

export default function Header({ auth, currentPath }) {
  return <LandingHeader auth={auth} currentPath={currentPath} />;
}
