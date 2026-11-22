import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import { PROFILE_FIELDS } from './collections';
import { useConfirmation, useToasts } from './feedback';
import { FieldInput, toFormValues, toPayload, useSaveShortcut } from './fields';

type Values = Record<string, unknown>;

export function ProfilePage() {
  const [values, setValues] = useState<Values>();
  // What the API has (loaded or last saved), to tell whether anything changed.
  const [saved, setSaved] = useState<Values>();
  const [loadError, setLoadError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  useSaveShortcut(submitRef);
  const { notify, toasts } = useToasts();
  const { dialog } = useConfirmation(JSON.stringify(values) !== JSON.stringify(saved));

  const load = useCallback(() => {
    const start = (values: Values) => {
      setValues(values);
      setSaved(values);
    };
    api<Values>('/admin/profile', { auth: true }).then(
      (profile) => start(toFormValues(PROFILE_FIELDS, profile)),
      // No profile yet: start from an empty form (the first save creates it).
      (error: unknown) =>
        error instanceof ApiError && error.status === 404 ? start(toFormValues(PROFILE_FIELDS)) : setLoadError((error as Error).message),
    );
  }, []);
  useEffect(load, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!values) return;
    setSaving(true);
    try {
      await api('/admin/profile', { method: 'PUT', json: toPayload(PROFILE_FIELDS, values), auth: true });
      setSaved(values); // what was sent: typing during the save stays unsaved
      notify('Perfil salvo.');
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  if (!values)
    return loadError ? (
      <div className="actions load-error">
        <p className="form-error">{loadError}</p>
        <button
          type="button"
          className="button"
          onClick={() => {
            setLoadError(undefined);
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
    <>
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
        </div>
      </form>
      {dialog}
      {toasts}
    </>
  );
}
