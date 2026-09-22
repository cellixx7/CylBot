import { CircleHelp, LayoutDashboard, LogIn, LogOut, Settings, Sparkles, UserRound } from 'lucide-react';

export default function Header({ auth, currentPath }) {
  const authenticated = auth.status === 'authenticated';
  const checkingSession = auth.status === 'loading';

  return (
    <header className={`site-header ${currentPath === '/' ? 'site-header-home' : ''}`}>
      <a className="wordmark" href="#/" aria-label="CylBot, página inicial" title="Início">CylBot</a>

      <nav className="header-controls" aria-label="Acesso rápido">
        {authenticated ? (
          <>
            <a className={`dashboard-shortcut ${currentPath === '/dashboard' ? 'is-current' : ''}`} href="#/dashboard" aria-label="Dashboard" title="Dashboard">
              <LayoutDashboard aria-hidden="true" />
            </a>
            <details className="account-menu">
              <summary aria-label={`Abrir menu de ${auth.user.displayName}`} title="Configurações da conta">
                <img src={auth.user.avatarUrl} width="42" height="42" alt="" referrerPolicy="no-referrer" />
              </summary>
              <div className="account-popover">
                <div className="account-identity">
                  <img src={auth.user.avatarUrl} width="40" height="40" alt="" referrerPolicy="no-referrer" />
                  <span><strong>{auth.user.displayName}</strong><small>@{auth.user.username}</small></span>
                </div>
                <a href="#/configuracoes"><Settings aria-hidden="true" /> Configurações</a>
                <a href="#/profile"><UserRound aria-hidden="true" /> Perfil</a>
                <a href="mailto:suporte@cylbot.app"><CircleHelp aria-hidden="true" /> Suporte</a>
                <a className="premium-link" href="#/premium"><Sparkles aria-hidden="true" /> Premium <small>Em breve</small></a>
                <button type="button" onClick={auth.logout} disabled={auth.loggingOut} aria-busy={auth.loggingOut}>
                  <LogOut aria-hidden="true" /> {auth.loggingOut ? 'Saindo...' : 'Sair do Discord'}
                </button>
              </div>
            </details>
          </>
        ) : checkingSession ? (
          <span className="session-indicator" aria-label="Verificando sessão" title="Verificando sessão" />
        ) : (
          <a href="/api/auth/discord" aria-label="Entrar com Discord" title="Entrar com Discord"><LogIn aria-hidden="true" /></a>
        )}
      </nav>
    </header>
  );
}
