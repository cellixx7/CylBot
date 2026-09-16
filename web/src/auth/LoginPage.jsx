import { useEffect, useState } from 'react';

export default function LoginPage({ reloginRequired = false }) {
  const [failed] = useState(() => new URLSearchParams(window.location.search).has('authError'));
  useEffect(() => {
    document.title = 'Entrar | CylBot';
    if (failed) {
      const url = new URL(window.location.href);
      url.searchParams.delete('authError');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [failed]);
  return (
    <main className="app-shell auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <span className="brand"><span className="brand-mark" aria-hidden="true">C.</span>CylBot</span>
        <p className="eyebrow">BOAS CONVERSAS COMEÇAM AQUI</p>
        <h1 id="login-title">Seu próximo<br /><em>olá.</em></h1>
        <p className="description">Entre com sua conta do Discord para continuar no CylBot.</p>
        {failed && <p className="auth-error" role="alert">Não foi possível entrar com Discord. Tente novamente.</p>}
        {reloginRequired && <p role="status">Entre novamente para renovar sua sessão e autorizar o acesso à lista de servidores.</p>}
        <a className="landing-cta auth-login" href="/api/auth/discord">Entrar com Discord <span aria-hidden="true">↗</span></a>
        <p className="landing-caption">Usamos seu perfil básico e sua lista de servidores. Sua senha fica no Discord.</p>
      </section>
    </main>
  );
}
