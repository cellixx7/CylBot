import { useEffect, useRef, useState } from 'react';
import './about-section.css';

const aboutConcepts = [
  {
    number: '01',
    title: 'Autonomia',
    description: 'O CYL foi criado pensando em autonomia, controle e personalização além do que o Discord pode ofertar. A comunidade deixa de depender de soluções fragmentadas e passa a ter uma base própria para crescer no seu ritmo.',
    accent: '#7C5CFF',
    type: 'autonomy',
  },
  {
    number: '02',
    title: 'Controle',
    description: 'Ele foi desenvolvido por alguém que sentiu as frustrações de administrar uma ou mais comunidades. Por isso, cada fluxo ajuda a organizar decisões, atendimento e rotina sem esconder o contexto de quem está no comando.',
    accent: '#5865F2',
    type: 'control',
  },
  {
    number: '03',
    title: 'Personalização',
    description: 'E também pensando na comunidade, com liberdade de personalização. A experiência pode acompanhar a identidade, a linguagem e as regras de cada espaço, sem obrigar todo mundo a funcionar do mesmo jeito.',
    accent: '#A98BFF',
    type: 'customization',
  },
];

const skills = [
  {
    icon: 'C',
    title: 'Comunidade',
    description: 'Crie experiências próprias para sua comunidade, dentro e fora do Discord.',
    accent: '#5865F2',
  },
  {
    icon: 'A',
    title: 'Automação',
    description: 'Transforme rotinas da equipe em fluxos previsíveis e personalizáveis.',
    accent: '#7C5CFF',
  },
  {
    icon: 'T',
    title: 'Atendimento',
    description: 'Organize tickets, histórico e handoff sem perder o contexto da comunidade.',
    accent: '#A98BFF',
  },
  {
    icon: 'AI',
    title: 'Inteligência',
    description: 'Use IA com contexto, controle e a personalidade da sua comunidade.',
    accent: '#59D8FF',
  },
];

function useConceptReveal() {
  const cardRefs = useRef([]);
  const [motionReady, setMotionReady] = useState(false);
  const [revealedCards, setRevealedCards] = useState(() => new Set());

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setRevealedCards(new Set(aboutConcepts.map((_, index) => index)));
      return undefined;
    }

    setMotionReady(true);
    const observer = new IntersectionObserver(
      entries => {
        const enteredIndexes = entries
          .filter(entry => entry.isIntersecting)
          .map(entry => Number(entry.target.dataset.conceptIndex));

        if (enteredIndexes.length === 0) return;

        setRevealedCards(current => {
          const next = new Set(current);
          enteredIndexes.forEach(index => next.add(index));
          return next;
        });
        enteredIndexes.forEach(index => observer.unobserve(cardRefs.current[index]));
      },
      { threshold: 0.2, rootMargin: '0px 0px -8% 0px' },
    );

    cardRefs.current.forEach(card => card && observer.observe(card));
    return () => observer.disconnect();
  }, []);

  return {
    motionReady,
    revealedCards,
    setCardRef: index => element => { cardRefs.current[index] = element; },
  };
}

function ConceptVisual({ type }) {
  if (type === 'autonomy') {
    return (
      <div className="cyl-about-concept-visual cyl-about-flow-visual" aria-hidden="true">
        <span>Evento</span>
        <i>→</i>
        <strong>CYL</strong>
        <i>→</i>
        <span>Ação</span>
      </div>
    );
  }

  if (type === 'control') {
    return (
      <div className="cyl-about-concept-visual cyl-about-control-visual" aria-hidden="true">
        {[
          ['Automação', 'ON', true],
          ['IA', 'ON', true],
          ['Tickets', 'ON', true],
          ['Permissões', 'Configurar', false],
        ].map(([label, value, enabled]) => (
          <div className="cyl-about-control-row" key={label}>
            <span>{label}</span>
            {enabled ? <i className="cyl-about-fake-switch is-on">{value}</i> : <em>{value}</em>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="cyl-about-concept-visual cyl-about-customization-visual" aria-hidden="true">
      <div className="cyl-about-swatches">
        <span className="is-selected" />
        <span />
        <span />
        <small>Roxo&nbsp;&nbsp; Azul&nbsp;&nbsp; Cyan</small>
      </div>
      <div className="cyl-about-setting"><span>Assistente</span><strong>Luna</strong></div>
      <div className="cyl-about-setting"><span>Tom</span><strong>Natural</strong></div>
    </div>
  );
}

function ConceptCard({ concept, index, motionReady, revealed, setCardRef }) {
  return (
    <article
      ref={setCardRef(index)}
      className={`cyl-about-concept-card${motionReady ? ' has-motion' : ''}${revealed ? ' is-visible' : ''}`}
      data-concept-index={index}
      style={{ '--cyl-about-accent': concept.accent, '--cyl-about-delay': `${index * 120}ms` }}
    >
      <div className="cyl-about-concept-heading">
        <span className="cyl-about-concept-number">{concept.number}</span>
        <h3>{concept.title}</h3>
      </div>
      <p>{concept.description}</p>
      <ConceptVisual type={concept.type} />
      <div className="cyl-about-concept-track" aria-hidden="true"><span /></div>
    </article>
  );
}

export default function AboutSection() {
  const { motionReady, revealedCards, setCardRef } = useConceptReveal();

  return (
    <section id="sobre" className="cyl-about" aria-labelledby="cyl-about-title">
      <div className="cyl-about-inner">
        <p className="cyl-about-eyebrow">SOBRE O CYL</p>
        <h2 id="cyl-about-title">Cyl é a aplicação para o avanço da sua comunidade.</h2>
        <p className="cyl-about-intro">
          O CYL conecta Discord, web, automação, IA e identidade em uma experiência única, sem tirar da comunidade aquilo que ela já ama.
        </p>

        <div className="cyl-about-concept-grid" aria-label="Princípios do CYL">
          {aboutConcepts.map((concept, index) => (
            <ConceptCard
              key={concept.number}
              concept={concept}
              index={index}
              motionReady={motionReady}
              revealed={revealedCards.has(index)}
              setCardRef={setCardRef}
            />
          ))}
        </div>

        <h3 className="cyl-about-skills-title">O que o CYL sabe fazer</h3>
        <div className="cyl-about-skills-grid">
          {skills.map(skill => (
            <article className="cyl-about-skill-card" key={skill.title}>
              <span className="cyl-about-skill-icon" style={{ backgroundColor: skill.accent }} aria-hidden="true">
                {skill.icon}
              </span>
              <h4>{skill.title}</h4>
              <p>{skill.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
