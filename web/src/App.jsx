import { useEffect, useMemo, useState } from 'react';
import Anuncios from './anuncios/anuncios.jsx';
import TextaAI from './texta_ai/texta_ai.jsx';
import AuthGate from './auth/AuthGate.jsx';
import LoginPage from './auth/LoginPage.jsx';
import { useAuth } from './auth/useAuth.js';
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import Dashboard from './dashboard/Dashboard.jsx';
import Home from './home/Home.jsx';
import ProfilePage from './profile/ProfilePage.jsx';
import TicketsPage from './tickets/TicketsPage.jsx';

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');

  useEffect(() => {
    const navigate = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);

  return useMemo(() => {
    const [path, query = ''] = hash.replace(/^#/, '').split('?');
    return { path: path || '/', query: new URLSearchParams(query) };
  }, [hash]);
}

const TITLES = {
  '/': 'CylBot | O app no seu controle',
  '/login': 'Entrar | CylBot',
  '/profile': 'Meu perfil | CylBot',
  '/dashboard': 'Seus servidores | CylBot',
  '/anuncios': 'Anúncios | CylBot',
  '/texta_ai': 'Texta_AI | CylBot',
};

export default function App() {
  const auth = useAuth();
  const route = useHashRoute();
  const ticketRoute = route.path.match(/^\/dashboard\/(\d{17,20})\/tickets(?:\/([a-f0-9-]{36}))?$/);
  const selectedGuildId = ticketRoute?.[1] || route.path.match(/^\/dashboard\/(\d{17,20})$/)?.[1] || null;
  const baseRoute = selectedGuildId ? '/dashboard' : route.path;

  useEffect(() => {
    document.title = TITLES[baseRoute] || TITLES['/'];
    if (!route.query.has('section')) window.scrollTo(0, 0);
  }, [baseRoute, route.query]);

  useEffect(() => {
    if (route.path === '/login' && auth.status === 'authenticated') {
      window.location.hash = '#/dashboard';
    }
  }, [auth.status, route.path]);

  let page;
  if (route.path === '/' || !TITLES[baseRoute]) {
    page = <Home auth={auth} section={route.query.get('section')} />;
  } else if (route.path === '/login') {
    page = <LoginPage authStatus={auth.status} reloginRequired={auth.reloginRequired} />;
  } else {
    page = (
      <AuthGate auth={auth}>
        {route.path === '/profile' && <ProfilePage user={auth.user} />}
        {ticketRoute ? <TicketsPage key={`${selectedGuildId}/${ticketRoute[2] || ''}`} guildId={selectedGuildId}
          ticketId={ticketRoute[2]} requireRelogin={auth.requireRelogin} /> : (route.path === '/dashboard' || selectedGuildId) && (
          <Dashboard user={auth.user} selectedGuildId={selectedGuildId} requireRelogin={auth.requireRelogin} />
        )}
        {route.path === '/anuncios' && <Anuncios />}
        {route.path === '/texta_ai' && <TextaAI />}
      </AuthGate>
    );
  }

  return (
    <div className="site-shell">
      <Header auth={auth} currentPath={baseRoute} />
      {auth.error && <p className="global-alert" role="alert">{auth.error}</p>}
      {page}
      <Footer />
    </div>
  );
}
