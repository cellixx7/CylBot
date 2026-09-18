import LoginPage from './LoginPage.jsx';

export default function AuthGate({ auth, children }) {
  if (auth.status === 'loading') {
    return <main className="state-page"><span className="loading-mark" aria-hidden="true" /><p role="status">Verificando sua sessão...</p></main>;
  }

  if (auth.status === 'error') {
    return (
      <main className="state-page">
        <p className="eyebrow">CONEXÃO INTERROMPIDA</p>
        <h1>Vamos tentar de novo?</h1>
        <p>Não foi possível verificar sua sessão.</p>
        <button className="button button-primary" type="button" onClick={auth.retry}>Tentar novamente</button>
      </main>
    );
  }

  if (auth.status === 'unauthenticated') {
    return <LoginPage reloginRequired={auth.reloginRequired} />;
  }

  return children;
}
