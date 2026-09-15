import { useEffect, useState } from 'react';
import Anuncios from './anuncios/anuncios.jsx';
import TextaAI from './texta_ai/texta_ai.jsx';

export default function App() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    function navigate() {
      setRoute(window.location.hash);
      window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);

  const isAnnouncements = route === '#/anuncios';
  const isTextaAI = route === '#/texta_ai';

  useEffect(() => {
    document.title = isAnnouncements ? 'Anúncios | CylBot' : isTextaAI ? 'Texta_AI | CylBot' : 'CylBot | Seu bot para Discord';
  }, [isTextaAI, isAnnouncements]);

  if (isAnnouncements) return <Anuncios />;
  if (isTextaAI) return <TextaAI />;

  return (
    <main className="app-shell landing-shell">
      <header className="landing-header">
        <span className="brand"><span className="brand-mark" aria-hidden="true">C.</span>CylBot</span>
        <span className="landing-tag">FEITO PARA O DISCORD</span>
      </header>

      <section className="landing-hero" aria-labelledby="welcome-title">
        <div className="landing-copy">
          <p className="eyebrow">SEU SERVIDOR. SUAS IDEIAS.</p>
          <h1 id="welcome-title">Prazer,<br />eu sou o <em>CylBot.</em></h1>
          <p className="description">Um bot para dar voz às suas ideias no Discord. Crie mensagens com ajuda de IA, ajuste cada detalhe e converse com sua comunidade do seu jeito.</p>
          <a className="landing-cta" href="#/texta_ai">Conhecer o Texta_AI <span aria-hidden="true">↗</span></a>
          <a className="back-link announcements-link" href="#/anuncios">Criar anúncios →</a>
          <p className="landing-caption">Da primeira ideia à mensagem pronta para enviar.</p>
        </div>

        <div className="bot-card" aria-label="Apresentação do CylBot">
          <div className="bot-card-top"><span>CONHEÇA SEU BOT</span><span aria-hidden="true">✦</span></div>
          <div className="bot-face" aria-hidden="true"><span /><span /></div>
          <h2>Uma ideia já é um começo.</h2>
          <p>Eu ajudo com as palavras.</p>
          <div className="bot-message"><span className="bot-message-label">CYLBOT</span><p>Um aviso, uma novidade ou aquele recado para a comunidade. Vamos escrever?</p></div>
          <span className="bot-card-signature">MENOS RASCUNHOS, MAIS CONVERSAS.</span>
        </div>
      </section>

      <section className="landing-features" aria-label="O que você pode fazer com o Texta_AI">
        <div><span className="step">01 / CRIE</span><h2>Comece com uma ideia</h2><p>Transforme um rascunho em texto com ajuda de inteligência artificial.</p></div>
        <div><span className="step">02 / REVISE</span><h2>Deixe com a sua cara</h2><p>Veja a prévia e acrescente contexto até a mensagem ficar pronta.</p></div>
        <div><span className="step">03 / ENVIE</span><h2>Leve para o Discord</h2><p>Escolha entre texto e embed e envie para o canal que você informar.</p></div>
      </section>

      <footer className="landing-footer"><span>CylBot</span><span>Boas conversas começam com boas ideias.</span></footer>
    </main>
  );
}
