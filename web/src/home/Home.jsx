import cylLogoUrl from '../assets/brand/cyl-logo-white.png';
import { discordInstallUrl } from '../lib/discordLinks.js';
import AboutSection from './AboutSection.jsx';
import CommunityPreview from './CommunityPreview.jsx';
import FeaturesSection from './FeaturesSection.jsx';
import './home.css';

function scrollToAbout(event) {
  const aboutSection = document.getElementById('sobre');
  event.preventDefault();

  if (!aboutSection) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  aboutSection.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
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
          <p>Controle total da sua comunidade de forma automatizada e organizada.</p>

          <div className="cyl-hero-actions">
            <a className="cyl-hero-button cyl-hero-button-primary" href="#sobre" onClick={scrollToAbout}>
              Saiba mais
            </a>
            <a className="cyl-hero-button cyl-hero-button-secondary" href={discordInstallUrl}>
              Adicione o Cyl
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
