import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import { useLang } from '../lib/i18n';

export function ContactForm() {
  const { t } = useLang();
  const [status, setStatus] = useState<{ sending: boolean; message?: string; error?: boolean }>({ sending: false });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus({ sending: true });
    try {
      await api('/contact', { method: 'POST', json: Object.fromEntries(new FormData(form)) });
      form.reset();
      setStatus({ sending: false, message: t.messageSent });
    } catch (error) {
      // Success only on a 2xx (api() throws otherwise). The browser checks the fields first, so a 400 is rare (blank
      // text); anything else is a delivery failure (Discord down, too many messages, offline).
      const message = error instanceof ApiError && error.status === 400 ? t.contactInvalid : t.contactFailed;
      setStatus({ sending: false, message, error: true });
    }
  };

  return (
    <form className="form" onSubmit={(event) => void submit(event)}>
      <label>
        {t.name}
        <input name="name" required maxLength={120} />
      </label>
      <label>
        {t.email}
        <input name="email" type="email" required maxLength={254} />
      </label>
      <label>
        {t.message}
        <textarea name="message" required maxLength={4000} rows={4} />
      </label>
      {/* Honeypot: invisible and out of the tab order, so only bots fill it (the API then drops the message). A name
          no browser or extension autofills: a real message must never be dropped. */}
      <input className="visually-hidden" name="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <button className="button button-accent" type="submit" disabled={status.sending} aria-busy={status.sending}>
        {status.sending ? t.sending : t.send}
      </button>
      {/* Always there: a live region announces changes to its text, not its arrival. */}
      <p className={status.error ? 'form-error' : 'form-message'} role="status">
        {status.message}
      </p>
    </form>
  );
}
