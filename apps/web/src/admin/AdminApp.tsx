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

  useEffect(() => {
    refreshSession().then((ok) => setSession(ok ? 'in' : 'out'), () => setSession('out'));
  }, []);

  if (session === 'checking') return <p className="status">Carregando…</p>;
  if (session === 'out') return <LoginPage notice={notice} onLoggedIn={() => setSession('in')} />;

  const endSession = (message?: string) => {
    setNotice(message);
    setSession('out');
  };

  return (
    <div className="admin">
      <aside className="admin-nav">
        <Link to="/" className="brand">
          Ver site
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await login(form.get('email') as string, form.get('password') as string);
      onLoggedIn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <main className="login">
      <form className="form" onSubmit={(event) => void submit(event)}>
        <h1>Admin</h1>
        {notice && <p className="form-message">{notice}</p>}
        <label>
          E-mail
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Senha
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="button button-accent">
          Entrar
        </button>
        {error && <p className="form-error">{error}</p>}
      </form>
    </main>
  );
}
