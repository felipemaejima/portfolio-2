import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, forgetSession } from '../lib/api';
import { useArrivalParam, useConfirmation } from './feedback';

/**
 * Conta: the password and the Conta vinculada Google. Changing the password or unlinking ends every session (the API
 * revokes all refresh tokens): back to the login screen, saying why.
 */
export function AccountPage({ onSessionEnded }: { onSessionEnded: (message: string) => void }) {
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(undefined);
    try {
      await api('/admin/account/password', { method: 'PATCH', json: Object.fromEntries(form), auth: true });
      forgetSession();
      onSessionEnded('Senha trocada. Entre com a nova senha.');
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <>
      <form className="form admin-form" onSubmit={(event) => void submit(event)}>
        <h1>Trocar senha</h1>
        <label>
          Senha atual
          <input name="currentPassword" type="password" autoComplete="current-password" required />
        </label>
        <label>
          Nova senha
          <input name="newPassword" type="password" autoComplete="new-password" required />
        </label>
        <p className="muted">Todas as sessões serão encerradas; entre de novo com a nova senha.</p>
        <button type="submit" className="button button-accent" disabled={saving} aria-busy={saving}>
          {saving ? 'Trocando…' : 'Trocar senha'}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <GoogleAccountSection onSessionEnded={onSessionEnded} />
    </>
  );
}

type LinkedGoogleAccount = { email: string; linkedAt: string };
type Message = { text: string; error?: boolean };

/** What the API's Google callback says by /admin/conta?google=<code>. A cancel on Google comes back with nothing. */
const GOOGLE_RESULTS = new Map<string, Message>([
  ['vinculada', { text: 'Conta Google vinculada.' }],
  ['erro', { text: 'Não foi possível vincular a conta Google.', error: true }],
]);

/** Linking asks for the current password, then the browser goes to Google and comes back here. */
function GoogleAccountSection({ onSessionEnded }: { onSessionEnded: (message: string) => void }) {
  const [account, setAccount] = useState<LinkedGoogleAccount | null>(); // undefined while loading; null: none
  const outcome = useArrivalParam('google');
  const [message, setMessage] = useState(() => GOOGLE_RESULTS.get(outcome ?? ''));
  const [linking, setLinking] = useState(false);
  const { ask, dialog } = useConfirmation();
  const fail = (e: unknown) => setMessage({ text: (e as Error).message, error: true });

  useEffect(() => {
    api<LinkedGoogleAccount>('/admin/account/google', { auth: true }).then(setAccount, (e: unknown) =>
      e instanceof ApiError && e.status === 404 ? setAccount(null) : fail(e),
    );
  }, []);

  const link = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLinking(true);
    setMessage(undefined);
    try {
      const json = Object.fromEntries(new FormData(event.currentTarget));
      const { url } = await api<{ url: string }>('/admin/account/google', { method: 'POST', json, auth: true });
      window.location.assign(url); // off to Google; it comes back to this page
    } catch (e) {
      fail(e);
      setLinking(false);
    }
  };

  const unlink = () =>
    ask({
      title: 'Desvincular a conta Google?',
      message: 'Todas as sessões serão encerradas; entre de novo com a senha.',
      confirm: 'Desvincular',
      onConfirm: () =>
        void api('/admin/account/google', { method: 'DELETE', auth: true }).then(() => {
          forgetSession();
          onSessionEnded('Conta Google desvinculada. Entre de novo.');
        }, fail),
    });

  return (
    <form className="form admin-form" aria-labelledby="google-account-title" onSubmit={(event) => void link(event)}>
      <h2 id="google-account-title">Conta Google</h2>
      {account === undefined && !message?.error && <p className="status loading">Carregando…</p>}
      {account && (
        <>
          <p>
            Vinculada a <strong>{account.email}</strong>: entre com ela pelo botão &quot;Entrar com Google&quot;.
          </p>
          <button type="button" className="button button-danger" onClick={unlink}>
            Desvincular
          </button>
        </>
      )}
      {account === null && (
        <>
          <p className="muted">Vincule para entrar com a conta Google, sem digitar a senha.</p>
          <label>
            Senha atual
            <input name="currentPassword" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit" className="button button-accent" disabled={linking} aria-busy={linking}>
            {linking ? 'Abrindo o Google…' : 'Vincular conta Google'}
          </button>
        </>
      )}
      {message && (
        <p className={message.error ? 'form-error' : 'form-message'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      {dialog}
    </form>
  );
}
