import { useEffect, useState, type ChangeEvent } from 'react';
import { api } from '../lib/api';

type LocalizedText = { pt: string; en?: string };
type Option = { value: string; label: string };
type Values = Record<string, unknown>;

/** Form fields of the admin, declared per collection (collections.ts) and rendered by FieldInput. */
export type Field = { key: string; label: string; required?: boolean } & (
  | { type: 'text' | 'url' | 'email' | 'date' | 'checkbox' | 'tags' }
  | { type: 'localized' | 'localizedText' | 'localizedList' }
  | { type: 'select'; options: readonly Option[] | (() => Promise<Option[]>) }
  | { type: 'media'; urlKey: string }
);

/** Form state from an API record (or the empty defaults of a new one). */
export function toFormValues(fields: Field[], record: Values = {}): Values {
  const values: Values = {};
  for (const field of fields) {
    const value = record[field.key];
    switch (field.type) {
      case 'localized':
      case 'localizedText':
        values[field.key] = { pt: '', en: '', ...(value as LocalizedText | undefined) };
        break;
      case 'localizedList':
        values[field.key] = ((value as LocalizedText[] | undefined) ?? []).map((item) => ({ en: '', ...item }));
        break;
      case 'tags':
        values[field.key] = ((value as string[] | undefined) ?? []).join(', ');
        break;
      case 'date':
        values[field.key] = typeof value === 'string' ? value.slice(0, 10) : '';
        break;
      case 'checkbox':
        values[field.key] = Boolean(value);
        break;
      case 'media':
        values[field.key] = value ?? null;
        values[field.urlKey] = record[field.urlKey] ?? null;
        break;
      default:
        values[field.key] = value ?? '';
    }
  }
  return values;
}

/**
 * Request body with exactly the declared fields: the API rejects unknown ones (id, timestamps, derived URLs).
 * Blank optional values become null, which also clears them on update. English is omitted when blank.
 */
export function toPayload(fields: Field[], values: Values): Values {
  const localized = (text: LocalizedText) => (text.en?.trim() ? { pt: text.pt, en: text.en } : { pt: text.pt });
  const payload: Values = {};
  for (const field of fields) {
    const value = values[field.key];
    switch (field.type) {
      case 'localized':
      case 'localizedText':
        payload[field.key] = localized(value as LocalizedText);
        break;
      case 'localizedList':
        payload[field.key] = (value as LocalizedText[]).filter((item) => item.pt.trim()).map(localized);
        break;
      case 'tags':
        payload[field.key] = (value as string)
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
        break;
      case 'checkbox':
        payload[field.key] = value;
        break;
      default:
        payload[field.key] = value === '' ? null : value;
    }
  }
  return payload;
}

export function FieldInput({ field, values, onChange }: { field: Field; values: Values; onChange: (changes: Values) => void }) {
  const value = values[field.key];
  const set = (next: unknown) => onChange({ [field.key]: next });
  const onText = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(event.target.value);

  switch (field.type) {
    case 'checkbox':
      return (
        <label className="check">
          <input type="checkbox" checked={value as boolean} onChange={(event) => set(event.target.checked)} />
          {field.label}
        </label>
      );
    case 'localized':
    case 'localizedText':
      return <LocalizedInput label={field.label} multiline={field.type === 'localizedText'} required={field.required} value={value as LocalizedText} onChange={set} />;
    case 'localizedList':
      return <LocalizedListInput label={field.label} value={value as LocalizedText[]} onChange={set} />;
    case 'select':
      return <SelectInput field={field} value={value as string} onChange={onText} />;
    case 'media':
      return <MediaInput label={field.label} url={values[field.urlKey] as string | null} onChange={(id, url) => onChange({ [field.key]: id, [field.urlKey]: url })} />;
    case 'tags':
      return (
        <label>
          <span>
            {field.label} <small>(separadas por vírgula)</small>
          </span>
          <input value={value as string} onChange={onText} />
        </label>
      );
    default:
      return (
        <label>
          {field.label}
          <input type={field.type} value={value as string} onChange={onText} required={field.required} />
        </label>
      );
  }
}

function LocalizedInput(props: { label: string; multiline: boolean; required?: boolean; value: LocalizedText; onChange: (value: LocalizedText) => void }) {
  const { label, multiline, required, value, onChange } = props;
  const Input = multiline ? 'textarea' : 'input';
  return (
    <fieldset className="localized">
      <legend>{label}</legend>
      <label>
        PT
        <Input value={value.pt} required={required} rows={multiline ? 3 : undefined} onChange={(event) => onChange({ ...value, pt: event.target.value })} />
      </label>
      <label>
        <span>
          EN <small>(opcional; vazio usa o PT)</small>
        </span>
        <Input value={value.en ?? ''} rows={multiline ? 3 : undefined} onChange={(event) => onChange({ ...value, en: event.target.value })} />
      </label>
    </fieldset>
  );
}

function LocalizedListInput({ label, value, onChange }: { label: string; value: LocalizedText[]; onChange: (value: LocalizedText[]) => void }) {
  const update = (index: number, item: LocalizedText) => onChange(value.map((current, i) => (i === index ? item : current)));
  return (
    <fieldset className="localized-list">
      <legend>{label}</legend>
      {value.map((item, index) => (
        <div key={index} className="list-item">
          <LocalizedInput label={`#${index + 1}`} multiline value={item} onChange={(next) => update(index, next)} />
          <button type="button" className="button button-small" onClick={() => onChange(value.filter((_, i) => i !== index))}>
            Remover
          </button>
        </div>
      ))}
      <button type="button" className="button button-small" onClick={() => onChange([...value, { pt: '', en: '' }])}>
        Adicionar
      </button>
    </fieldset>
  );
}

function SelectInput({ field, value, onChange }: { field: Extract<Field, { type: 'select' }>; value: string; onChange: (event: ChangeEvent<HTMLSelectElement>) => void }) {
  const [options, setOptions] = useState<readonly Option[]>(typeof field.options === 'function' ? [] : field.options);
  useEffect(() => {
    if (typeof field.options === 'function') field.options().then(setOptions, () => setOptions([]));
  }, [field]);
  return (
    <label>
      {field.label}
      <select value={value} onChange={onChange} required={field.required}>
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MediaInput({ label, url, onChange }: { label: string; url: string | null; onChange: (id: string | null, url: string | null) => void }) {
  const [state, setState] = useState<{ uploading: boolean; error?: string }>({ uploading: false });
  const upload = async (file: File) => {
    setState({ uploading: true });
    try {
      const media = await api<{ id: string; url: string }>('/admin/uploads', { method: 'POST', file, auth: true });
      onChange(media.id, media.url);
      setState({ uploading: false });
    } catch (error) {
      setState({ uploading: false, error: (error as Error).message });
    }
  };
  return (
    <fieldset className="media">
      <legend>{label}</legend>
      {url && <img src={url} alt="" className="media-preview" />}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={state.uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <small>JPEG, PNG ou WebP, até 4 MB.</small>
      {url && (
        <button type="button" className="button button-small" onClick={() => onChange(null, null)}>
          Remover imagem
        </button>
      )}
      {state.uploading && <small className="loading">Enviando imagem…</small>}
      {state.error && <p className="form-error">{state.error}</p>}
    </fieldset>
  );
}
