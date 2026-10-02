import './footer.css';
import { discordInstallUrl as installUrl } from '../lib/discordLinks.js';
import { footerGroups, footerSocialLinks } from '../lib/footerLinks.js';

function footerHref(link) {
  if (link.type === 'section') return `#/?section=${encodeURIComponent(link.section)}`;
  if (link.type === 'coming-soon') return `#/em-breve?feature=${encodeURIComponent(link.slug)}`;
  return link.href;
}

function FooterLink({ link, className }) {
  const newTabProps = link.type === 'docs' ? { target: '_blank', rel: 'noreferrer' } : {};
  return <a className={className} href={footerHref(link)} {...newTabProps}>{link.label}</a>;
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
            <a className="cyl-footer-button" href={installUrl} target="_blank" rel="noreferrer">Adicionar o CYL ao Discord</a>
          ) : (
            <button className="cyl-footer-button" type="button" aria-disabled="true" aria-describedby="footer-install-status">
              Adicionar o CYL ao Discord
              <span id="footer-install-status" className="cyl-footer-sr-only">Instalação pelo site em breve.</span>
            </button>
          )}
        </section>

        <nav className="cyl-footer-links" aria-label="Links do rodapé">
          {footerGroups.map(({ title, links }) => (
            <div className="cyl-footer-column" key={title}>
              <h3>{title}</h3>
              <ul>
                {links.map(link => <li key={link.label}><FooterLink link={link} /></li>)}
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
            {footerSocialLinks.map(link => <FooterLink className="cyl-footer-pill" key={link.label} link={link} />)}
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
