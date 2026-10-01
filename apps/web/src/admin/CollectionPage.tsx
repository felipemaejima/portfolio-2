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
        // Esc: closes, unless a save is in flight.
        onCancel={(event) => (busy === 'save' ? event.preventDefault() : setEditing(null))}
      >
        {editing && (
          <form className="form field-grid" onSubmit={save}>
            <div className="modal-header">
              <h2 id="modal-title">{editing.id ? 'Editar item' : 'Novo item'}</h2>
              <button type="button" className="button button-small" aria-label="Fechar" disabled={busy === 'save'} onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>
            {collection.fields.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                values={editing.values}
                onChange={(changes) => setEditing({ ...editing, values: { ...editing.values, ...changes } })}
              />
            ))}
            {error && busy === null && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="actions form-footer">
              <button type="submit" className="button button-accent" disabled={busy !== null} aria-busy={busy === 'save'}>
                {busy === 'save' ? 'Salvando…' : 'Salvar'}
              </button>
              <button type="button" className="button" disabled={busy === 'save'} onClick={() => setEditing(null)}>
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
                <span className="admin-list-summary">
                  {collection.summary(item)}
                  {!item.visible && <small> (oculto)</small>}
                </span>
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
                <button type="button" className="button button-small" onClick={() => setEditing({ id: item.id, values: toFormValues(collection.fields, item) })}>
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
              </li>
            ))}
          </ol>
        </fieldset>
      )}
    </section>
  );
}
