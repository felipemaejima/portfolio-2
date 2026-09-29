import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import { PROFILE_FIELDS } from './collections';
import { FieldInput, toFormValues, toPayload } from './fields';

export function ProfilePage() {
  const [values, setValues] = useState<Record<string, unknown>>();
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    api<Record<string, unknown>>('/admin/profile', { auth: true }).then(
      (profile) => setValues(toFormValues(PROFILE_FIELDS, profile)),
      // No profile yet: start from an empty form (the first save creates it).
      (error: unknown) =>
        error instanceof ApiError && error.status === 404 ? setValues(toFormValues(PROFILE_FIELDS)) : setStatus((error as Error).message),
    );
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!values) return;
    try {
      await api('/admin/profile', { method: 'PUT', json: toPayload(PROFILE_FIELDS, values), auth: true });
      setStatus('Perfil salvo.');
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  if (!values) return <p className="muted">{status ?? 'Carregando…'}</p>;
  return (
    <form className="form admin-form" onSubmit={(event) => void save(event)}>
      <h1>Perfil</h1>
      {PROFILE_FIELDS.map((field) => (
        <FieldInput key={field.key} field={field} values={values} onChange={(changes) => setValues({ ...values, ...changes })} />
      ))}
      <button type="submit" className="button button-accent">
        Salvar
      </button>
      {status && (
        <p className="form-message" role="status">
          {status}
        </p>
      )}
    </form>
  );
}
