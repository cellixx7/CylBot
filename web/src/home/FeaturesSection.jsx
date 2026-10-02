import { useEffect, useRef, useState } from 'react';
import './features-section.css';

const features = [
  {
    id: 'tickets',
    category: 'SUPORTE',
    title: 'Tickets inteligentes',
    description: 'Atendimento com histórico, IA, handoff humano e controle por equipe.',
    accent: '#7C5CFF',
    type: 'tickets',
    href: '#/dashboard',
  },
  {
    id: 'automation',
    category: 'AUTOMAÇÕES',
    title: 'Automação visual',
    description: 'Crie fluxos que conectam eventos, condições e ações sem perder controle.',
    accent: '#5865F2',
    type: 'automation',
    href: '#recursos',
  },
  {
    id: 'community',
    category: 'COMUNIDADE',
    title: 'Comunidade expandida',
    description: 'Leve anúncios, perfis e experiências importantes também para a web.',
    accent: '#A98BFF',
    type: 'community',
    href: '#comunidade',
  },
  {
    id: 'assistants',
    category: 'INTELIGÊNCIA',
    title: 'Assistentes do CYL',
    description: 'Personalidades, contexto e respostas com orçamento de IA sustentável.',
    accent: '#59D8FF',
    type: 'ai',
    href: '#/texta_ai',
  },
];

function useFeatureReveal() {
  const sectionRef = useRef(null);
  const [motionReady, setMotionReady] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setMotionReady(true);

    if (prefersReducedMotion) {
      setRevealed(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setRevealed(true);
        observer.disconnect();
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return { motionReady, revealed, sectionRef };
}

function WindowDots() {
  return (
    <span className="cyl-feature-window-dots">
      <i className="is-red" />
      <i className="is-yellow" />
      <i className="is-green" />
    </span>
  );
}

function TicketsPreview() {
  const tickets = [
    ['#2481 • Reembolso', 'IA atendendo', 'is-ai'],
    ['#2482 • Acesso Premium', 'Humano assumiu', 'is-ai'],
    ['#2483 • Dúvida de automação', 'Resolvido', 'is-done'],
  ];

  return (
    <div className="cyl-feature-preview cyl-feature-tickets" aria-hidden="true">
      {tickets.map(([title, status, statusClass]) => (
        <div className="cyl-feature-ticket-row" key={title}>
          <strong>{title}</strong>
          <span className={statusClass}>{status}</span>
        </div>
      ))}
    </div>
  );
}

function AutomationPreview() {
  const nodes = [
    ['Gatilho', 'Entrada'],
    ['Condição', 'Cargo?'],
    ['Ação', 'Executar'],
  ];

  return (
    <div className="cyl-feature-preview cyl-feature-automation" aria-hidden="true">
      {nodes.map(([title, detail], index) => (
        <div className="cyl-feature-flow-group" key={title}>
          <div className={`cyl-feature-flow-node${index === 1 ? ' is-highlighted' : ''}`}>
            <strong>{title}</strong>
            <span>{detail}</span>
          </div>
          {index < nodes.length - 1 && <i className="cyl-feature-flow-connector" />}
        </div>
      ))}
    </div>
  );
}

function CommunityPreview() {
  return (
    <div className="cyl-feature-preview cyl-feature-community" aria-hidden="true">
      <aside className="cyl-feature-channel-list">
        <span className="is-active"># anúncios</span>
        <span># geral</span>
        <span># suporte</span>
      </aside>
      <div className="cyl-feature-mini-feed">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

function AiPreview() {
  return (
    <div className="cyl-feature-preview cyl-feature-ai" aria-hidden="true">
      <div className="cyl-feature-chat-user">Meu cargo não foi aplicado.</div>
      <div className="cyl-feature-chat-ai">Vou verificar a automação e explicar o que aconteceu antes de escalar.</div>
      <span className="cyl-feature-chat-status">✓ handoff disponível</span>
    </div>
  );
}

function FeaturePreview({ type }) {
  if (type === 'tickets') return <TicketsPreview />;
  if (type === 'automation') return <AutomationPreview />;
  if (type === 'community') return <CommunityPreview />;
  return <AiPreview />;
}

function FeatureCard({ feature, index }) {
  return (
    <article
      className="cyl-feature-card"
      style={{ '--cyl-feature-accent': feature.accent, '--cyl-feature-delay': `${index * 120}ms` }}
    >
      <header className="cyl-feature-card-header">
        <WindowDots />
        <span>{feature.category}</span>
      </header>
      <div className="cyl-feature-card-body">
        <div className="cyl-feature-copy">
          <h3>{feature.title}</h3>
          <p>{feature.description}</p>
          <a className="cyl-feature-cta" href={feature.href}>Explorar recurso</a>
        </div>
        <FeaturePreview type={feature.type} />
      </div>
    </article>
  );
}

export default function FeaturesSection() {
  const { motionReady, revealed, sectionRef } = useFeatureReveal();

  return (
    <section
      ref={sectionRef}
      id="recursos"
      className={`cyl-features${motionReady ? ' has-motion' : ''}${revealed ? ' is-revealed' : ''}`}
      aria-labelledby="cyl-features-title"
    >
      <div className="cyl-features-inner">
        <header className="cyl-features-heading">
          <p className="cyl-features-eyebrow">FUNÇÕES</p>
          <h2 id="cyl-features-title">Veja o CYL funcionando antes de abrir a documentação.</h2>
          <p>A landing apresenta cada recurso com uma mini experiência. Depois, cada bloco poderá apontar para um Docs completo com configuração, exemplos e limites.</p>
        </header>

        <div className="cyl-features-grid">
          {features.map((feature, index) => <FeatureCard key={feature.id} feature={feature} index={index} />)}
        </div>

        <section className="cyl-features-docs" aria-labelledby="cyl-features-docs-title">
          <div>
            <p className="cyl-features-docs-eyebrow">DOCUMENTAÇÃO</p>
            <h3 id="cyl-features-docs-title">Quando quiser ir fundo, o Docs assume.</h3>
            <p>Guias de configuração, referência de comandos, APIs, permissões, exemplos e troubleshooting.</p>
          </div>
          <a className="cyl-features-docs-cta" href="#recursos">Explorar Docs do CYL <span aria-hidden="true">→</span></a>
        </section>
      </div>
    </section>
  );
}
