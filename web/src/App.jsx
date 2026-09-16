import { useEffect, useState } from 'react';
import Anuncios from './anuncios/anuncios.jsx';
import TextaAI from './texta_ai/texta_ai.jsx';
import AuthGate from './auth/AuthGate';
import Dashboard from './dashboard/Dashboard';

function AuthenticatedApp({ user, logout, loggingOut, error, requireRelogin }) {
  const [route, setRoute] = useState(window.location.hash);
  useEffect(() => {
    function navigate() { setRoute(window.location.hash); window.scrollTo(0, 0); }
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  const isAnnouncements = route === '#/anuncios';
  const isTextaAI = route === '#/texta_ai';
  const selectedGuildId = route.startsWith('#/dashboard/') ? route.slice('#/dashboard/'.length) : null;
  useEffect(() => {
    document.title = isAnnouncements ? 'Anúncios | CylBot' : isTextaAI ? 'Texta_AI | CylBot' : 'Seus servidores | CylBot';
  }, [isTextaAI, isAnnouncements]);

  return <>
    <header className="auth-account-bar">
      <a className="brand" href="#/dashboard">CylBot</a>
      <button type="button" onClick={logout} disabled={loggingOut}>{loggingOut ? 'Saindo…' : 'Sair'}</button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </header>
    {isAnnouncements ? <Anuncios /> : isTextaAI ? <TextaAI />
      : <Dashboard user={user} selectedGuildId={selectedGuildId} requireRelogin={requireRelogin} />}
  </>;
}

export default function App() {
  return <AuthGate>{auth => <AuthenticatedApp {...auth} />}</AuthGate>;
}
