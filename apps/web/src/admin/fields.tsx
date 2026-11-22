import { useEffect, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { api } from '../lib/api';

type LocalizedText = { pt: string; en?: string };
type Option = { value: string; label: string };
type Values = Record<string, unknown>;

/** Form fields of the admin, declared per collection (collections.ts) and rendered by FieldInput. `maxLength` mirrors the API's. */
export type Field = { key: string; label: string; required?: boolean; maxLength?: number } & (
  | { type: 'text' | 'url' | 'email' | 'date' | 'checkbox' | 'tags' }
  | { type: 'localized' | 'localizedText' | 'localizedList' }
  | { type: 'select'; options: readonly Option[] | (() => Promise<Option[]>) }
  | { type: 'media'; urlKey: string }
);

// The API's limits, checked by the browser before sending (localized texts: up to 5000 characters each).
// type="url" alone accepts any scheme (ftp:, mailto:…); the API takes http(s) only.
const URL_RULES = { pattern: 'https?://.+', maxLength: 500, title: 'Endereço completo, começando com http:// ou https://' };
// ponytail: empty entries (",,") count toward the 20; toPayload drops them, so at worst a stray comma must go.
const TAGS_PATTERN = String.raw`\s*[^,]{0,40}\s*(,\s*[^,]{0,40}\s*){0,19}`;
// The API's uploads: these types (MEDIA_MIMES, sniffed from the bytes) up to MAX_UPLOAD_BYTES (4 MiB). See apps/api/src/media.
// ponytail: GIF and SVG are refused, not converted; accept them here once the API stores them.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Why the API would refuse this image, in Portuguese; undefined when it takes it. Check the size of what is sent: after shrinkImage. */
export function imageError(image: { type: string; size: number }): string | undefined {
  if (!IMAGE_TYPES.includes(image.type)) return 'Formato não aceito: use JPEG, PNG ou WebP.';
  if (image.size > MAX_IMAGE_BYTES) return 'Imagem grande demais: o limite é 4 MB, mesmo depois de reduzida.';
}

type Size = { width: number; height: number };

/**
 * Size to re-encode an image to: longest side at most 1600px, never upscaled. Also re-encoded (as WebP, so smaller) when
 * over the API's limit at its own size. null when it can go as it is.
 */
export function resizeTo({ width, height }: Size, bytes: number): Size | null {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  if (scale === 1 && bytes <= MAX_IMAGE_BYTES) return null;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** What to upload: the file itself, or a WebP re-encode when resizeTo asks for one (EXIF rotation applied, metadata dropped). */
async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Não foi possível ler esta imagem.');
  });
  try {
    const size = resizeTo(bitmap, file.size);
    if (!size) return file;
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const webp = await canvas.convertToBlob({ type: 'image/webp' });
    // ponytail: Safari can't encode WebP (hands back a PNG, often over the limit): JPEG there, losing any transparency.
    return webp.type === 'image/webp' ? webp : canvas.convertToBlob({ type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}

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

/** Whether a record has Portuguese text without its English version (the site then shows the Portuguese). */
export function missingEnglish(fields: Field[], record: Values): boolean {
  const lacksEn = (text?: LocalizedText) => Boolean(text?.pt.trim() && !text.en?.trim());
  return fields.some((field) => {
    const value = record[field.key];
    if (field.type === 'localizedList') return ((value as LocalizedText[] | undefined) ?? []).some(lacksEn);
    return (field.type === 'localized' || field.type === 'localizedText') && lacksEn(value as LocalizedText | undefined);
  });
}

/**
 * Ctrl+S / Cmd+S (while `active`) presses the form's submit button instead of the browser's "save page". Through the button,
 * so a disabled one (saving, an image uploading) ignores it. On the window: focus may be on the page, not in the form.
 */
export function useSaveShortcut(submit: RefObject<HTMLButtonElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      submit.current?.click();
    };
    addEventListener('keydown', onKeyDown);
    return () => removeEventListener('keydown', onKeyDown);
  }, [submit, active]);
}

/** `onUploading` reports an image upload in flight, so the form can hold save/cancel until it lands. */
export function FieldInput(props: { field: Field; values: Values; onChange: (changes: Values) => void; onUploading?: (uploading: boolean) => void }) {
  const { field, values, onChange, onUploading } = props;
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
      return (
        <MediaInput
          label={field.label}
          url={values[field.urlKey] as string | null}
          onChange={(id, url) => onChange({ [field.key]: id, [field.urlKey]: url })}
          onUploading={onUploading}
        />
      );
    case 'tags':
      return (
        <label>
          <span>
            {field.label} <small>(separadas por vírgula; até 20, de até 40 caracteres)</small>
          </span>
          <input value={value as string} onChange={onText} pattern={TAGS_PATTERN} title="Até 20 tags, de até 40 caracteres cada." />
        </label>
      );
    default:
      return (
        <label>
          {field.label}
          <input
            type={field.type}
            value={value as string}
            onChange={onText}
            required={field.required}
            maxLength={field.maxLength}
            {...(field.type === 'url' ? URL_RULES : {})}
          />
        </label>
      );
  }
}

/** `children`: extra controls next to the legend (a list item's Remover). */
function LocalizedInput(props: {
  label: string;
  multiline: boolean;
  required?: boolean;
  value: LocalizedText;
  onChange: (value: LocalizedText) => void;
  children?: ReactNode;
}) {
  const { label, multiline, required, value, onChange, children } = props;
  const Input = multiline ? 'textarea' : 'input';
  return (
    <fieldset className="localized">
      <legend>{label}</legend>
      {children}
      <label>
        PT
        <Input lang="pt-BR" value={value.pt} required={required} maxLength={5000} rows={multiline ? 3 : undefined} onChange={(event) => onChange({ ...value, pt: event.target.value })} />
      </label>
      <label>
        <span>
          EN <small>(opcional; vazio usa o PT)</small>
        </span>
        <Input lang="en" value={value.en ?? ''} maxLength={5000} rows={multiline ? 3 : undefined} onChange={(event) => onChange({ ...value, en: event.target.value })} />
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
        <LocalizedInput key={index} label={`#${index + 1}`} multiline value={item} onChange={(next) => update(index, next)}>
          <button type="button" className="button button-small" onClick={() => onChange(value.filter((_, i) => i !== index))}>
            Remover
          </button>
        </LocalizedInput>
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

function MediaInput(props: {
  label: string;
  url: string | null;
  onChange: (id: string | null, url: string | null) => void;
  onUploading?: (uploading: boolean) => void;
}) {
  const { label, url, onChange, onUploading } = props;
  // `preview`: the picked file, shown at once (object URL) until the upload settles; freed when replaced or on unmount.
  const [state, setState] = useState<{ uploading: boolean; error?: string; preview?: string }>({ uploading: false });
  const [dropTarget, setDropTarget] = useState(false);
  const { preview } = state;
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const upload = async (file: File) => {
    // The type first: only what the API stores is decoded and previewed. The size after shrinking, which brings most photos under it.
    if (!IMAGE_TYPES.includes(file.type)) {
      setState({ uploading: false, error: imageError(file) });
      return;
    }
    setState({ uploading: true, preview: URL.createObjectURL(file) });
    onUploading?.(true);
    try {
      const image = await shrinkImage(file);
      const error = imageError(image);
      if (error) throw new Error(error);
      const media = await api<{ id: string; url: string }>('/admin/uploads', { method: 'POST', file: image, auth: true });
      onChange(media.id, media.url);
      setState({ uploading: false });
    } catch (error) {
      setState({ uploading: false, error: (error as Error).message });
    } finally {
      onUploading?.(false);
    }
  };
  return (
    <fieldset
      className={dropTarget ? 'media drop-target' : 'media'}
      // Drag and drop: an image file dropped anywhere on the field.
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropTarget(false);
        const file = event.dataTransfer.files[0];
        if (file && !state.uploading) void upload(file);
      }}
    >
      <legend>{label}</legend>
      {(preview ?? url) && <img src={preview ?? url!} alt="" className="media-preview" />}
      <div className="actions">
        {/* The native input, visually hidden inside a label styled as a button: still focused and named by it. */}
        <label className="button button-small">
          Escolher imagem
          <input
            type="file"
            className="visually-hidden"
            accept={IMAGE_TYPES.join()}
            disabled={state.uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = ''; // picking the same file again (after a refusal) still fires a change
              if (file) void upload(file);
            }}
          />
        </label>
        {url && (
          <button type="button" className="button button-small" onClick={() => onChange(null, null)}>
            Remover imagem
          </button>
        )}
      </div>
      <small>JPEG, PNG ou WebP, até 4 MB; com mais de 1600 px, a imagem é reduzida. Também dá para arrastá-la até aqui.</small>
      {state.uploading && <small className="loading">Enviando imagem…</small>}
      {state.error && <p className="form-error">{state.error}</p>}
    </fieldset>
  );
}
