import { useAuth } from './useAuth';
import LoginPage from './LoginPage';

export default function AuthGate({ children }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <main className="app-shell auth-shell"><p role="status">Verificando sua sessão…</p></main>;
  if (auth.status === 'error') return (
    <main className="app-shell auth-shell"><section className="auth-card">
      <h1>Vamos tentar de novo?</h1>
      <p role="alert">Não foi possível verificar sua sessão.</p>
      <button type="button" onClick={auth.retry}>Tentar novamente</button>
    </section></main>
  );
  if (auth.status === 'unauthenticated') return <LoginPage reloginRequired={auth.reloginRequired} />;
  return children(auth);
}
