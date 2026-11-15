import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import type { Collection } from './collections';
import { FieldInput, toFormValues, toPayload } from './fields';

type Item = Record<string, unknown> & { id: string; visible: boolean };

/** List (in display order), reorder (drag or arrows), show/hide, create, edit and delete — for any collection in collections.ts. */
export function CollectionPage({ collection }: { collection: Collection }) {
  const [items, setItems] = useState<Item[]>();
  const [editing, setEditing] = useState<{ id?: string; values: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  // What is being saved: 'save', 'reorder', 'visible:<id>' or 'delete:<id>'. One change at a time.
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const orderBeforeDrag = useRef('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  const base = `/admin/${collection.path}`;
  const fetchItems = useCallback(async () => {
    // Projects come paginated ({ items }); the other collections are plain arrays.
    const result = await api<Item[] | { items: Item[] }>(`${base}${collection.listQuery ?? ''}`, { auth: true });
    return Array.isArray(result) ? result : result.items;
  }, [base, collection.listQuery]);

  useEffect(() => {
    fetchItems().then(setItems, (e: Error) => setError(e.message));
  }, [fetchItems]);

  // The form lives in a native modal <dialog>: opened while `editing` is set (focus trap, Esc and backdrop for free).
  const isEditing = editing !== null;
  // The last form stays rendered while the dialog fades out (styles.css), instead of emptying it mid-exit.
  const [lastEditing, setLastEditing] = useState(editing);
  if (editing && editing !== lastEditing) setLastEditing(editing);
  const shown = editing ?? lastEditing;
  const locked = busy === 'save' || uploading; // the form can't close mid-save or mid-upload
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isEditing && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('input, textarea, select')?.focus(); // not the close button
    }
    if (!isEditing && dialog.open) dialog.close();
  }, [isEditing]);

  /** Runs a change, then reloads the list from the API (also undoing an optimistic reorder that failed). */
  const run = async (key: string, action: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
      setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    }
    try {
      setItems(await fetchItems());
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };

  const reorder = (ids: string[]) => void run('reorder', () => api(`${base}/reorder`, { method: 'PATCH', json: { ids }, auth: true }), 'Ordem salva.');

  const move = (list: Item[], index: number, offset: number) => {
    const ids = list.map((item) => item.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    reorder(ids);
  };

  // Drag and drop: the list reorders live while dragging; the new order is saved when the drag ends.
  const dragOver = (overId: string) => {
    if (!dragId || overId === dragId) return;
    setItems((current) => {
      if (!current) return current;
      const next = [...current];
      const from = next.findIndex((item) => item.id === dragId);
      const to = next.findIndex((item) => item.id === overId);
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
  };

  const dragEnd = (list: Item[]) => {
    setDragId(null);
    const ids = list.map((item) => item.id);
    if (ids.join() !== orderBeforeDrag.current) reorder(ids);
  };

  const edit = (item: Item) => setEditing({ id: item.id, values: toFormValues(collection.fields, item) });

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const json = toPayload(collection.fields, editing.values);
    void run(
      'save',
      async () => {
        await (editing.id
          ? api(`${base}/${editing.id}`, { method: 'PATCH', json, auth: true })
          : api(base, { method: 'POST', json, auth: true }));
        setEditing(null);
      },
      'Item salvo.',
    );
  };

  return (
    <section>
      <div className="admin-title">
        <h1>{collection.title}</h1>
        <button type="button" className="button button-accent" disabled={busy !== null} onClick={() => setEditing({ values: toFormValues(collection.fields) })}>
          Novo item
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="modal-title"
        // Esc: closes, unless a save or an upload is in flight.
        onCancel={(event) => (locked ? event.preventDefault() : setEditing(null))}
      >
        {shown && (
          <form className="form field-grid" onSubmit={save}>
            <div className="modal-header">
              <h2 id="modal-title">{shown.id ? 'Editar item' : 'Novo item'}</h2>
              <button type="button" className="button button-small" aria-label="Fechar" disabled={locked} onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>
            {collection.fields.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                values={shown.values}
                onUploading={setUploading}
                // From the latest state: an upload finishing after more typing (or after the form closed) must not restore a stale copy.
                onChange={(changes) => setEditing((current) => current && { ...current, values: { ...current.values, ...changes } })}
              />
            ))}
            {error && busy === null && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="actions form-footer">
              <button type="submit" className="button button-accent" disabled={busy !== null || uploading} aria-busy={busy === 'save'}>
                {busy === 'save' ? 'Salvando…' : 'Salvar'}
              </button>
              <button type="button" className="button" disabled={locked} onClick={() => setEditing(null)}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </dialog>

      <div className="admin-feedback" role="status">
        {busy ? <div className="progress" aria-label="Salvando" /> : error ? <p className="form-error">{error}</p> : notice && <p className="form-message">{notice}</p>}
      </div>

      {!items ? (
        !error && <p className="muted loading">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="muted empty">Nada aqui ainda. Use “Novo item” para criar o primeiro.</p>
      ) : (
        // A disabled fieldset disables every button inside while a change is being saved.
        <fieldset className="bare" disabled={busy !== null} aria-busy={busy !== null}>
          <ol className="admin-list">
            {items.map((item, index) => (
              <li
                key={item.id}
                className={[item.visible ? '' : 'hidden-item', item.id === dragId ? 'dragging' : ''].join(' ').trim() || undefined}
                draggable={busy === null}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', item.id); // Firefox only starts a drag with data set.
                  orderBeforeDrag.current = items.map((i) => i.id).join();
                  setDragId(item.id);
                }}
                onDragOver={(event) => {
                  if (!dragId) return;
                  event.preventDefault();
                  dragOver(item.id);
                }}
                onDrop={(event) => event.preventDefault()}
                onDragEnd={() => dragEnd(items)}
              >
                <span className="drag-handle" aria-hidden="true" title="Arraste para reordenar">
                  ⠿
                </span>
                <button type="button" className="admin-list-summary" onClick={() => edit(item)}>
                  {collection.summary(item)}
                  {!item.visible && <small> (oculto)</small>}
                </button>
                {/* Inline on wide screens; on narrow ones the ⋯ button opens them as a sheet (styles.css). Closes after any action. */}
                <button type="button" className="button button-small item-menu-toggle" popoverTarget={`actions-${item.id}`} aria-label={`Ações: ${collection.summary(item)}`}>
                  ⋯
                </button>
                <div
                  id={`actions-${item.id}`}
                  className="item-actions"
                  popover="auto"
                  onClick={(event) => {
                    if (event.target instanceof HTMLButtonElement) event.currentTarget.hidePopover();
                  }}
                >
                  <button type="button" className="button button-small" aria-label="Subir" disabled={index === 0} onClick={() => move(items, index, -1)}>
                    ↑
                  </button>
                  <button type="button" className="button button-small" aria-label="Descer" disabled={index === items.length - 1} onClick={() => move(items, index, 1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className="button button-small"
                    aria-busy={busy === `visible:${item.id}`}
                    onClick={() => void run(`visible:${item.id}`, () => api(`${base}/${item.id}`, { method: 'PATCH', json: { visible: !item.visible }, auth: true }))}
                  >
                    {item.visible ? 'Ocultar' : 'Mostrar'}
                  </button>
                  <button type="button" className="button button-small" onClick={() => edit(item)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="button button-small button-danger"
                    aria-busy={busy === `delete:${item.id}`}
                    onClick={() => {
                      if (confirm('Excluir este item?')) void run(`delete:${item.id}`, () => api(`${base}/${item.id}`, { method: 'DELETE', auth: true }), 'Item excluído.');
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </fieldset>
      )}
    </section>
  );
}
