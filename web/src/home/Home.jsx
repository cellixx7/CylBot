import cylLogoUrl from '../assets/brand/cyl-logo-white.png';
import { discordInstallUrl } from '../lib/discordLinks.js';
import AboutSection from './AboutSection.jsx';
import CommunityPreview from './CommunityPreview.jsx';
import FeaturesSection from './FeaturesSection.jsx';
import './home.css';

function scrollToSection(event, sectionId) {
  const section = document.getElementById(sectionId);
  event.preventDefault();

  if (!section) return;

  const headerBottom = document.querySelector('.cyl-header')?.getBoundingClientRect().bottom || 0;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const top = Math.max(0, window.scrollY + section.getBoundingClientRect().top - headerBottom - 24);
  window.scrollTo({ top, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
}

export default function Home() {
  return (
    <main className="home-page">
      <section className="cyl-hero" aria-labelledby="cyl-hero-title">
        <img
          className="cyl-hero-watermark"
          src={cylLogoUrl}
          alt=""
          aria-hidden="true"
          decoding="async"
          draggable="false"
        />

        <div className="cyl-hero-content">
          <h1 id="cyl-hero-title">CYL</h1>
          <p>A plataforma que conecta Discord e web para administradores e equipes organizarem atendimento, automação e inteligência da comunidade.</p>

          <div className="cyl-hero-actions">
            <a className="cyl-hero-button cyl-hero-button-primary" href="#recursos" onClick={event => scrollToSection(event, 'recursos')}>
              Ver recursos
            </a>
            <a className="cyl-hero-button cyl-hero-button-secondary" href={discordInstallUrl}>
              Adicionar o CYL
            </a>
          </div>
        </div>

        <CommunityPreview />
      </section>

      <AboutSection />
      <FeaturesSection />
    </main>
  );
}
