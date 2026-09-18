import { LayoutDashboard, LogIn, LogOut, UserRound } from 'lucide-react';
import logoUrl from '../assets/brand/cylbot-logo.png';

export default function Header({ auth, currentPath }) {
  const authenticated = auth.status === 'authenticated';

  return (
    <header className={`site-header ${currentPath === '/' ? 'site-header-home' : ''}`}>
      <a className="brand-symbol brand-symbol-small" href="#/" aria-label="CylBot, página inicial" title="Início">
        <img src={logoUrl} alt="" />
      </a>

      <nav className="header-controls" aria-label="Acesso rápido">
        {authenticated ? (
          <>
            <a className={currentPath === '/dashboard' ? 'is-current' : ''} href="#/dashboard" aria-label="Dashboard" title="Dashboard">
              <LayoutDashboard aria-hidden="true" />
            </a>
            <details className="account-menu">
              <summary aria-label="Abrir menu do perfil" title="Perfil"><UserRound aria-hidden="true" /></summary>
              <div className="account-popover">
                <div className="account-identity">
                  <img src={auth.user.avatarUrl} width="36" height="36" alt="" referrerPolicy="no-referrer" />
                  <span><strong>{auth.user.displayName}</strong><small>@{auth.user.username}</small></span>
                </div>
                <a href="#/profile"><UserRound aria-hidden="true" /> Meu perfil</a>
                <a href="#/dashboard"><LayoutDashboard aria-hidden="true" /> Dashboard</a>
                <button type="button" onClick={auth.logout} disabled={auth.loggingOut}>
                  <LogOut aria-hidden="true" /> {auth.loggingOut ? 'Saindo...' : 'Sair'}
                </button>
              </div>
            </details>
          </>
        ) : (
          <a href="#/login" aria-label="Entrar" title="Entrar"><LogIn aria-hidden="true" /></a>
        )}
      </nav>
    </header>
  );
}
