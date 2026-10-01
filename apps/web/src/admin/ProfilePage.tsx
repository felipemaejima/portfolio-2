import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import { PROFILE_FIELDS } from './collections';
import { FieldInput, toFormValues, toPayload } from './fields';

export function ProfilePage() {
  const [values, setValues] = useState<Record<string, unknown>>();
  const [status, setStatus] = useState<string>();
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    setStatus(undefined);
    try {
      await api('/admin/profile', { method: 'PUT', json: toPayload(PROFILE_FIELDS, values), auth: true });
      setStatus('Perfil salvo.');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!values) return <p className={status ? 'form-error' : 'muted loading'}>{status ?? 'Carregando…'}</p>;
  return (
    <form className="form admin-form field-grid" onSubmit={(event) => void save(event)}>
      <h1>Perfil</h1>
      {PROFILE_FIELDS.map((field) => (
        <FieldInput key={field.key} field={field} values={values} onChange={(changes) => setValues({ ...values, ...changes })} />
      ))}
      <div className="form-footer">
        <button type="submit" className="button button-accent" disabled={saving} aria-busy={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {status && (
          <p className="form-message" role="status">
            {status}
          </p>
        )}
      </div>
    </form>
  );
}
