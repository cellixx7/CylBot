export default function Footer() {
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
