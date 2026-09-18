import logoUrl from '../assets/brand/cylbot-logo.png';

export default function Footer() {
  return (
    <footer className="site-footer">
      <a className="footer-brand" href="#/">
        <span className="brand-symbol brand-symbol-footer" aria-hidden="true"><img src={logoUrl} alt="" /></span>
        <span>CYLBOT</span>
      </a>
      <p>Automação, inteligência e controle para comunidades no Discord.</p>
      <nav aria-label="Links do rodapé">
        <a href="#/?section=contato">Contato</a>
        <a href="#/?section=criador">Criador</a>
        <a href="#/login">Entrar</a>
      </nav>
      <small>© {new Date().getFullYear()} CylBot. Construído por Marcelo Vaz Oliveira.</small>
    </footer>
  );
}
