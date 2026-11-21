import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router';
import { ApiError, login, logout, refreshSession } from '../lib/api';
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

  useEffect(() => {
    refreshSession().then((ok) => setSession(ok ? 'in' : 'out'), () => setSession('out'));
  }, []);

  if (session === 'checking') return <p className="status loading">Carregando…</p>;
  if (session === 'out') return <LoginPage notice={notice} onLoggedIn={() => setSession('in')} />;

  const endSession = (message?: string) => {
    setNotice(message);
    setSession('out');
  };

  return (
    <div className="admin">
      {/* Desktop: a sidebar. Phones: a top bar (Sair and theme always in it) whose menu button opens the nav as a drawer (styles.css). */}
      <aside className="admin-nav">
        <span className="brand">Painel</span>
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

function LoginPage({ notice, onLoggedIn }: { notice?: string; onLoggedIn: () => void }) {
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError(undefined);
    try {
      await login(form.get('email') as string, form.get('password') as string);
      markAdminBrowser(); // this browser never counts as a Visita
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
