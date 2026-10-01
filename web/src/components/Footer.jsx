import './footer.css';
import { discordInstallUrl as installUrl, discordCommunityUrl as communityUrl } from '../lib/discordLinks.js';

const repositoryUrl = 'https://github.com/cellixx7/CylBot';
const contactUrl = 'mailto:suporte@cylbot.app';

const linkGroups = [
  {
    title: 'Produto',
    links: [
      ['Recursos'], ['Comunidade'], ['Tickets', '#/dashboard'], ['Automação'],
      ['IA', '#/texta_ai'], ['Premium'], ['CYL Credits'], ['Docs', `${repositoryUrl}#readme`],
    ],
  },
  {
    title: 'Empresa',
    links: [
      ['Sobre o CYL', `${repositoryUrl}#readme`], ['Parceiros'],
      ['Seja parceiro', `${contactUrl}?subject=Parceria%20CYL`],
      ['Trabalhe conosco'], ['Status'], ['Roadmap'],
    ],
  },
  {
    title: 'Comunidade',
    links: [
      ['Servidor do Discord', communityUrl], ['GitHub', repositoryUrl],
      ['Suporte', contactUrl], ['Contato', contactUrl],
      ['Sugestões', `${repositoryUrl}/issues/new?title=Sugest%C3%A3o%3A%20`],
      ['Reportar problema', `${repositoryUrl}/issues/new`],
    ],
  },
  {
    title: 'Legal',
    links: [
      ['Termos de Uso'], ['Política de Privacidade'], ['Política de Cookies'],
      ['LGPD'], ['Termos Premium'], ['Uso aceitável'],
    ],
  },
  {
    title: 'Desenvolvedores',
    links: [
      ['Documentação', `${repositoryUrl}#readme`], ['API'], ['Changelog'],
      ['Integrações'], ['Segurança', `${contactUrl}?subject=Seguran%C3%A7a%20CYL`],
      ['Open source', repositoryUrl],
    ],
  },
];

const socialLinks = [['GitHub', repositoryUrl], ['Discord', communityUrl], ['Contato', contactUrl]];

function FooterLink({ label, href, className }) {
  if (!href) {
    return <span className={className} role="link" aria-disabled="true" aria-label={`${label} — em breve`} title="Em breve">{label}</span>;
  }

  return <a className={className} href={href}>{label}</a>;
}

function LandingFooter() {
  return (
    <footer className="cyl-footer">
      <div className="cyl-footer-container">
        <section className="cyl-footer-cta" aria-labelledby="footer-cta-title">
          <div className="cyl-footer-copy">
            <h2 id="footer-cta-title">Sua comunidade já existe.<br />Agora dê a ela uma plataforma.</h2>
            <p>Conecte comunidade, suporte, automação e inteligência com o CYL.</p>
          </div>
          {installUrl ? (
            <a className="cyl-footer-button" href={installUrl}>Adicionar o CYL ao Discord</a>
          ) : (
            <button className="cyl-footer-button" type="button" aria-disabled="true" aria-describedby="footer-install-status">
              Adicionar o CYL ao Discord
              <span id="footer-install-status" className="cyl-footer-sr-only">Instalação pelo site em breve.</span>
            </button>
          )}
        </section>

        <nav className="cyl-footer-links" aria-label="Links do rodapé">
          {linkGroups.map(({ title, links }) => (
            <div className="cyl-footer-column" key={title}>
              <h3>{title}</h3>
              <ul>
                {links.map(([label, href]) => <li key={label}><FooterLink label={label} href={href} /></li>)}
              </ul>
            </div>
          ))}
        </nav>

        <div className="cyl-footer-bottom">
          <div className="cyl-footer-identity">
            <a className="cyl-footer-brand" href="#/" aria-label="CYL — início">CYL</a>
            <small>© 2026 CYL. Construído para comunidades que querem mais.</small>
          </div>
          <nav className="cyl-footer-social" aria-label="Redes sociais e contato">
            {socialLinks.map(([label, href]) => <FooterLink className="cyl-footer-pill" key={label} label={label} href={href} />)}
          </nav>
        </div>
      </div>
    </footer>
  );
}

export default function Footer({ landing = false }) {
  if (landing) return <LandingFooter />;

  return (
    <footer className="site-footer">
      <a className="footer-brand" href="#/">CylBot</a>
      <p>Automação, inteligência e controle para comunidades no Discord.</p>
      <nav aria-label="Links do rodapé">
        <a href="#/?section=contato">Contato</a>
        <a href="#/?section=criador">Criador</a>
        <a href="/api/auth/discord">Entrar com Discord</a>
      </nav>
      <small>© {new Date().getFullYear()} CylBot. Construído por Marcelo Vaz Oliveira.</small>
    </footer>
  );
}
