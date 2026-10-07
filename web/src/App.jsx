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
import { parseServerRoute } from './dashboard/server/workspaceAccess.js';

const Anuncios = lazy(() => import('./anuncios/anuncios.jsx'));
const DashboardArea = lazy(() => import('./dashboard/DashboardArea.jsx'));
const ProfilePage = lazy(() => import('./profile/ProfilePage.jsx'));
const TextaAI = lazy(() => import('./texta_ai/texta_ai.jsx'));

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
  const serverRoute = parseServerRoute(route.path);
  const profileMatch = route.path.match(/^\/profile\/(\d{17,20})$/);
  const baseRoute = serverRoute ? '/dashboard' : profileMatch ? '/profile' : route.path;
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

      const headerBottom = document.querySelector('.cyl-header')?.getBoundingClientRect().bottom || 0;
      const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerBottom - 24);
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
          {baseRoute === '/profile' && <ProfilePage key={route.path} user={auth.user} profileUserId={profileMatch?.[1] || 'me'} initialGuildId={route.query.get('guildId') || ''} requireRelogin={auth.requireRelogin} />}
          {(route.path === '/dashboard' || serverRoute) && (
            <DashboardArea user={auth.user} serverRoute={serverRoute} requireRelogin={auth.requireRelogin} />
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
      <Footer />
    </div>
  );
}
