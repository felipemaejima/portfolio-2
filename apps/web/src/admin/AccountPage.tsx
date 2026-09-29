import { useState, type FormEvent } from 'react';
import { api, forgetSession } from '../lib/api';

/** Changing the password ends every session (the API revokes all refresh tokens): back to the login screen. */
export function AccountPage({ onSessionEnded }: { onSessionEnded: () => void }) {
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/admin/account/password', { method: 'PATCH', json: Object.fromEntries(form), auth: true });
      forgetSession();
      onSessionEnded();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
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
      <button type="submit" className="button button-accent">
        Trocar senha
      </button>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
