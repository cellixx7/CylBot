import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import AuthGate from './auth/AuthGate.jsx';
import { useAuth } from './auth/useAuth.js';
import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import Home from './home/Home.jsx';
import ComingSoonPage from './pages/ComingSoonPage.jsx';
import { getComingSoonFeature } from './lib/comingSoonFeatures.js';
import './styles/cyl-theme.css';

const Anuncios = lazy(() => import('./anuncios/anuncios.jsx'));
const Dashboard = lazy(() => import('./dashboard/Dashboard.jsx'));
const ProfilePage = lazy(() => import('./profile/ProfilePage.jsx'));
const TextaAI = lazy(() => import('./texta_ai/texta_ai.jsx'));
const TicketsPage = lazy(() => import('./tickets/TicketsPage.jsx'));

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
  '/profile': 'Meu perfil | CylBot',
  '/dashboard': 'Seus servidores | CylBot',
  '/anuncios': 'Anúncios | CylBot',
  '/texta_ai': 'Texta_AI | CylBot',
  '/em-breve': 'Em breve | CYL',
};

export default function App() {
  const auth = useAuth();
  const route = useHashRoute();
  const ticketRoute = route.path.match(/^\/dashboard\/(\d{17,20})\/tickets(?:\/([a-f0-9-]{36}))?$/);
  const selectedGuildId = ticketRoute?.[1] || route.path.match(/^\/dashboard\/(\d{17,20})$/)?.[1] || null;
  const baseRoute = selectedGuildId ? '/dashboard' : route.path;
  const isComingSoonRoute = route.path === '/em-breve';
  const comingSoonFeature = isComingSoonRoute ? getComingSoonFeature(route.query.get('feature')) : null;

  useEffect(() => {
    document.title = isComingSoonRoute
      ? `${comingSoonFeature.isFallback ? 'Em breve' : comingSoonFeature.title} | CYL`
      : TITLES[baseRoute] || TITLES['/'];
    if (!route.query.has('section')) window.scrollTo(0, 0);
  }, [baseRoute, isComingSoonRoute, comingSoonFeature, route.query]);

  useEffect(() => {
    const section = route.query.get('section');
    const availableSections = ['recursos', 'sobre', 'comunidade', 'premium'];
    if (baseRoute !== '/' || !availableSections.includes(section)) return undefined;

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(section);
      if (!target) return;

      const headerHeight = document.querySelector('.cyl-header')?.getBoundingClientRect().height || 0;
      const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerHeight - 24);
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [baseRoute, route.query]);

  useEffect(() => {
    if (route.path === '/login') {
      window.location.hash = '#/';
    }
  }, [route.path]);

  let page;
  if (isComingSoonRoute) {
    page = <ComingSoonPage featureSlug={route.query.get('feature')} />;
  } else if (route.path === '/' || !TITLES[baseRoute]) {
    page = <Home auth={auth} section={route.query.get('section')} />;
  } else {
    page = (
      <AuthGate auth={auth}>
        <Suspense fallback={<div className="state-page" role="status">Carregando página…</div>}>
          {route.path === '/profile' && <ProfilePage user={auth.user} />}
          {ticketRoute ? <TicketsPage key={`${selectedGuildId}/${ticketRoute[2] || ''}`} guildId={selectedGuildId}
            ticketId={ticketRoute[2]} requireRelogin={auth.requireRelogin} /> : (route.path === '/dashboard' || selectedGuildId) && (
            <Dashboard user={auth.user} selectedGuildId={selectedGuildId} requireRelogin={auth.requireRelogin} />
          )}
          {route.path === '/anuncios' && <Anuncios />}
          {route.path === '/texta_ai' && <TextaAI />}
        </Suspense>
      </AuthGate>
    );
  }

  return (
    <div className="site-shell">
      <Header auth={auth} currentPath={baseRoute} />
      <ThemeToggle />
      {auth.error && <p className="global-alert" role="alert">{auth.error}</p>}
      {page}
      <Footer landing={baseRoute === '/' || baseRoute === '/em-breve' || !TITLES[baseRoute]} />
    </div>
  );
}
