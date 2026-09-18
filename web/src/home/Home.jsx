import { useEffect } from 'react';
import backgroundUrl from '../assets/brand/cylbot-background.png';
import logoUrl from '../assets/brand/cylbot-logo.png';

const features = [
  ['Inteligência Artificial', 'Disponível'],
  ['Automação', 'Em desenvolvimento'],
  ['Tickets', 'Em desenvolvimento'],
  ['Moderação', 'Em breve'],
  ['Dashboard', 'Disponível'],
  ['Integrações', 'Em breve'],
];

export default function Home({ section }) {
  useEffect(() => {
    if (!section) return;
    requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' }));
  }, [section]);

  return (
    <main className="home-page">
      <section className="hero" id="produto" style={{ backgroundImage: `url(${backgroundUrl})` }}>
        <div className="hero-content">
          <span className="brand-symbol brand-symbol-hero" aria-hidden="true"><img src={logoUrl} alt="" /></span>
          <h1>CYLBOT</h1>
          <p>O app no seu controle.</p>
        </div>
        <div className="hero-visual" aria-hidden="true" />
      </section>

      <section className="minimal-section about-section" id="sobre" aria-labelledby="about-title">
        <span className="section-index">01 / SOBRE</span>
        <h2 id="about-title">Controle para quem<br />constrói comunidades.</h2>
        <p>O CylBot reúne automação e inteligência para simplificar a rotina de servidores no Discord.</p>
      </section>

      <section className="minimal-section features-section" id="recursos" aria-labelledby="features-title">
        <div className="minimal-heading"><span className="section-index">02 / RECURSOS</span><h2 id="features-title">Ferramentas,<br />sem ruído.</h2></div>
        <div className="feature-list">
          {features.map(([title, status], index) => (
            <article className="feature-item" key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><small>{status}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="minimal-section community-section" id="comunidade" aria-labelledby="community-title">
        <span className="section-index">03 / COMUNIDADE</span>
        <h2 id="community-title">Tecnologia nos bastidores.<br />Pessoas no controle.</h2>
        <p>A área da comunidade será apresentada aqui em uma próxima etapa.</p>
      </section>

      <section className="minimal-section creator-section" id="criador" aria-labelledby="creator-title">
        <span className="section-index">04 / CRIADOR</span>
        <h2 id="creator-title">Marcelo Vaz Oliveira.</h2>
        <p>Projeto independente criado entre engenharia, produto e comunidade.</p>
        <a className="text-link" href="https://github.com/cellixx7/CylBot" target="_blank" rel="noreferrer">GitHub ↗</a>
      </section>

      <section className="minimal-section contact-section" id="contato" aria-labelledby="contact-title">
        <span className="section-index">05 / CONTATO</span>
        <h2 id="contact-title">Entre no CylBot.</h2>
        <div className="contact-links"><a href="#/login">Acessar <span>→</span></a><a href="https://github.com/cellixx7/CylBot" target="_blank" rel="noreferrer">GitHub <span>↗</span></a></div>
      </section>
    </main>
  );
}
