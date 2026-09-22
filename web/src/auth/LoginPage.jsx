import { useEffect, useState } from 'react';

export default function LoginPage({ reloginRequired = false, authStatus = 'unauthenticated' }) {
  const [failed] = useState(() => new URLSearchParams(window.location.search).has('authError'));

  useEffect(() => {
    if (failed) {
      const url = new URL(window.location.href);
      url.searchParams.delete('authError');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [failed]);

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <span className="login-wordmark" aria-hidden="true">CylBot</span>
        <p className="eyebrow">ACESSO SEGURO PELO DISCORD</p>
        <h1 id="login-title">Entre no<br /><em>CylBot.</em></h1>
        <p className="description">Use sua conta Discord para acessar seus servidores, configurações e perfil.</p>
        {failed && <p className="inline-alert" role="alert">Não foi possível entrar com Discord. Tente novamente.</p>}
        {reloginRequired && <p className="inline-alert" role="status">Entre novamente para renovar sua sessão e o acesso à lista de servidores.</p>}
        {authStatus === 'loading' ? (
          <span className="button button-discord button-disabled" aria-live="polite">Verificando sessão...</span>
        ) : (
          <a className="button button-discord" href="/api/auth/discord">Entrar com Discord <span aria-hidden="true">↗</span></a>
        )}
        <p className="privacy-note">Usamos apenas seu perfil básico e sua lista de servidores. Sua senha permanece no Discord.</p>
      </section>
      <aside className="login-context" aria-label="Benefícios da conta CylBot">
        <span className="context-index">01 / IDENTIDADE</span>
        <h2>Uma conta.<br />Toda a comunidade.</h2>
        <p>Seu perfil conecta você ao CylBot sem limitar sua identidade a um único servidor.</p>
      </aside>
    </main>
  );
}
