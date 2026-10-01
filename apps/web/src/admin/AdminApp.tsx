import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router';
import { login, logout, refreshSession } from '../lib/api';
import { AccountPage } from './AccountPage';
import { CollectionPage } from './CollectionPage';
import { COLLECTIONS } from './collections';
import { ProfilePage } from './ProfilePage';

/** /admin/*: restores the session from the refresh cookie, or shows the login form. */
export function AdminApp() {
  const [session, setSession] = useState<'checking' | 'in' | 'out'>('checking');
  const [notice, setNotice] = useState<string>();
  const [navOpen, setNavOpen] = useState(initialNavOpen);

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
      <aside className={navOpen ? 'admin-nav' : 'admin-nav collapsed'}>
        <button
          type="button"
          className="button button-small nav-toggle"
          aria-expanded={navOpen}
          aria-controls="admin-menu"
          aria-label={navOpen ? 'Recolher menu' : 'Abrir menu'}
          title={navOpen ? 'Recolher menu' : 'Abrir menu'}
          onClick={() => {
            setNavOpen(!navOpen);
            try {
              localStorage.setItem(NAV_KEY, String(!navOpen));
            } catch {
              // Storage blocked: the choice just isn't remembered.
            }
          }}
        >
          {navOpen ? '«' : '☰'}
        </button>
        <div id="admin-menu" className="admin-menu" hidden={!navOpen}>
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
          <button type="button" className="button button-small" onClick={() => void logout().finally(() => endSession())}>
            Sair
          </button>
        </div>
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

const NAV_KEY = 'admin-nav-open';

/** Remembered choice; otherwise open on desktop, collapsed on phones. */
function initialNavOpen() {
  try {
    const saved = localStorage.getItem(NAV_KEY);
    if (saved) return saved === 'true';
  } catch {
    // Storage blocked: fall back to the screen size.
  }
  return !matchMedia('(max-width: 860px)').matches;
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
      onLoggedIn();
    } catch (e) {
      setError((e as Error).message);
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
