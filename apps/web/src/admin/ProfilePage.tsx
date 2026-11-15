import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import { PROFILE_FIELDS } from './collections';
import { FieldInput, toFormValues, toPayload, useSaveShortcut } from './fields';

export function ProfilePage() {
  const [values, setValues] = useState<Record<string, unknown>>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  useSaveShortcut(submitRef);

  const load = useCallback(() => {
    api<Record<string, unknown>>('/admin/profile', { auth: true }).then(
      (profile) => setValues(toFormValues(PROFILE_FIELDS, profile)),
      // No profile yet: start from an empty form (the first save creates it).
      (error: unknown) =>
        error instanceof ApiError && error.status === 404 ? setValues(toFormValues(PROFILE_FIELDS)) : setError((error as Error).message),
    );
  }, []);
  useEffect(load, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!values) return;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await api('/admin/profile', { method: 'PUT', json: toPayload(PROFILE_FIELDS, values), auth: true });
      setNotice('Perfil salvo.');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!values)
    return error ? (
      <div className="actions load-error">
        <p className="form-error">{error}</p>
        <button
          type="button"
          className="button"
          onClick={() => {
            setError(undefined);
            load();
          }}
        >
          Tentar de novo
        </button>
      </div>
    ) : (
      <p className="muted loading">Carregando…</p>
    );
  return (
    <form className="form admin-form field-grid" onSubmit={(event) => void save(event)}>
      <h1>Perfil</h1>
      {PROFILE_FIELDS.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          values={values}
          onChange={(changes) => setValues((current) => current && { ...current, ...changes })}
          onUploading={setUploading}
        />
      ))}
      <div className="form-footer">
        <button ref={submitRef} type="submit" className="button button-accent" disabled={saving || uploading} aria-busy={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="form-message" role="status">
            {notice}
          </p>
        )}
      </div>
    </form>
  );
}
