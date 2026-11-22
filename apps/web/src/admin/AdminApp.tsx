import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router';
import { ApiError, login, logout, refreshSession } from '../lib/api';
import { Logo } from '../lib/logo';
import { ThemeToggle } from '../lib/theme';
import { markAdminBrowser } from '../lib/visit';
import { AccountPage } from './AccountPage';
import { CollectionPage } from './CollectionPage';
import { COLLECTIONS } from './collections';
import { ProfilePage } from './ProfilePage';

/** /admin/*: restores the session from the refresh cookie, or shows the login form. */
export function AdminApp() {
  const [session, setSession] = useState<'checking' | 'in' | 'out'>('checking');
  const [notice, setNotice] = useState<string>();

  // However the session opens (restored on load or a Login), this browser never counts as a Visita: marked right away,
  // before the panel renders (an effect would run only after it).
  const sessionOpened = () => {
    markAdminBrowser();
    setSession('in');
  };

  useEffect(() => {
    refreshSession().then((ok) => (ok ? sessionOpened() : setSession('out')), () => setSession('out'));
  }, []);

  if (session === 'checking') return <p className="status loading">Carregando…</p>;
  if (session === 'out') return <LoginPage notice={notice} onLoggedIn={sessionOpened} />;

  const endSession = (message?: string) => {
    setNotice(message);
    setSession('out');
  };

  return (
    <div className="admin">
      {/* Desktop: a sidebar. Phones: a top bar (Sair and theme always in it) whose menu button opens the nav as a drawer (styles.css). */}
      <aside className="admin-nav">
        <span className="brand">
          <Logo className="brand-mark" />
          Painel
        </span>
        <div
          id="admin-menu"
          className="admin-menu"
          popover="auto"
          onClick={(event) => {
            if (event.target instanceof HTMLAnchorElement) event.currentTarget.hidePopover();
          }}
        >
          <Link to="/" className="back-link">
            ← Ver site
          </Link>
          <nav>
            <NavLink to="/admin" end>
              Perfil
            </NavLink>
            {COLLECTIONS.map((collection) => (
              <NavLink key={collection.path} to={`/admin/${collection.path}`}>
                {collection.title}
              </NavLink>
            ))}
            <NavLink to="/admin/conta">Senha</NavLink>
          </nav>
        </div>
        <div className="admin-menu-footer">
          <button type="button" className="button button-small" onClick={() => void logout().finally(() => endSession())}>
            Sair
          </button>
          <ThemeToggle labels={{ light: 'Usar tema claro', dark: 'Usar tema escuro' }} />
        </div>
        <button type="button" className="lang-toggle menu-toggle" popoverTarget="admin-menu" aria-label="Menu">
          ☰
        </button>
      </aside>
      <main className="admin-main">
        <Routes>
          <Route index element={<ProfilePage />} />
          <Route path="conta" element={<AccountPage onSessionEnded={() => endSession('Senha trocada. Entre com a nova senha.')} />} />
          <Route path=":collection" element={<CollectionRoute />} />
        </Routes>
      </main>
    </div>
  );
}

function CollectionRoute() {
  const collection = COLLECTIONS.find((c) => c.path === useParams().collection);
  return collection ? <CollectionPage key={collection.path} collection={collection} /> : <Navigate to="/admin" replace />;
}

/** What the API's Google callback says by /admin?google=<code>. A cancel on Google (`cancelado`) needs no word. */
const GOOGLE_FAILURES = new Map([
  ['nao-vinculada', 'Essa conta Google não está vinculada.'],
  ['erro', 'Não foi possível entrar com Google.'],
]);

function LoginPage({ notice, onLoggedIn }: { notice?: string; onLoggedIn: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState(() => GOOGLE_FAILURES.get(searchParams.get('google') ?? ''));
  const [sending, setSending] = useState(false);

  // Read once, then off the URL: a reload or a copied link doesn't say it again.
  useEffect(() => {
    if (!searchParams.has('google')) return;
    setSearchParams(
      (params) => {
        params.delete('google');
        return params;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError(undefined);
    try {
      await login(form.get('email') as string, form.get('password') as string);
      onLoggedIn();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'E-mail ou senha incorretos.' : (e as Error).message);
      setSending(false);
    }
  };

  return (
    <main className="login">
      <form className="form login-card" onSubmit={(event) => void submit(event)}>
        <div>
          <h1>Painel do site</h1>
          <p className="muted">Entre para editar o conteúdo do portfólio.</p>
        </div>
        {notice && <p className="form-message">{notice}</p>}
        <label>
          E-mail
          <input name="email" type="email" autoComplete="username" required autoFocus />
        </label>
        <label>
          Senha
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="button button-accent" disabled={sending} aria-busy={sending}>
          {sending ? 'Entrando…' : 'Entrar'}
        </button>
        {/* A plain link, not a form (the CSP's form-action): the API answers with a redirect to Google. */}
        <a href="/api/auth/google" className="google-button">
          <GoogleLogo />
          Entrar com Google
        </a>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <Link to="/" className="back-link">
        ← Voltar ao site
      </Link>
    </main>
  );
}

/** Google's standard "G", as its branding guidelines require on a sign-in button. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
