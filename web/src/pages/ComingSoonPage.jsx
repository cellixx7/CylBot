import { getComingSoonFeature } from '../lib/comingSoonFeatures.js';
import './coming-soon.css';

export default function ComingSoonPage({ featureSlug }) {
  const feature = getComingSoonFeature(featureSlug);

  return (
    <main className="coming-soon-page" aria-labelledby="coming-soon-title">
      <section className="coming-soon-card">
        <div className="coming-soon-mark" aria-hidden="true"><span>CYL</span></div>
        <p className="coming-soon-eyebrow">EM BREVE</p>
        <h1 id="coming-soon-title">{feature.title}</h1>
        <p className="coming-soon-description">{feature.description}</p>
        <div className="coming-soon-status"><span aria-hidden="true" />Em desenvolvimento</div>
        <p className="coming-soon-note">Estamos preparando este espaço para integrar essa experiência diretamente à plataforma CYL.</p>
        <div className="coming-soon-actions">
          <a className="coming-soon-button coming-soon-button-secondary" href="#/">Voltar para o início</a>
          <a className="coming-soon-button coming-soon-button-primary" href="#/?section=recursos">Conhecer os recursos</a>
        </div>
      </section>
    </main>
  );
}
