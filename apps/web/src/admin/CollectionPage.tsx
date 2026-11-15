import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import type { Collection } from './collections';
import { FieldInput, missingEnglish, toFormValues, toPayload, useSaveShortcut } from './fields';

type Item = Record<string, unknown> & { id: string; visible: boolean };
type Values = Record<string, unknown>;
/** A question in the confirmation dialog (delete, discard changes). */
type Confirmation = { title: string; message: string; confirm: string; cancel?: string; onConfirm: () => void };
const refuseFiles = (event: DragEvent) => {
  if (event.dataTransfer.types.includes('Files')) event.preventDefault();
};

/** List (in display order), reorder (drag or arrows), show/hide, create, edit and delete — for any collection in collections.ts. */
export function CollectionPage({ collection }: { collection: Collection }) {
  const [items, setItems] = useState<Item[]>();
  const [loadError, setLoadError] = useState<string>();
  // `initial`: the values the form opened with, to tell whether anything changed.
  const [editing, setEditing] = useState<{ id?: string; values: Values; initial: Values } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  // Rows with a change being saved: a spinner on each, and their actions wait for it.
  const [pending, setPending] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string; error?: boolean }[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const itemsBeforeDrag = useRef<Item[]>([]);
  const lastToast = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const base = `/admin/${collection.path}`;
  const fetchItems = useCallback(async () => {
    // Projects come paginated ({ items }); the other collections are plain arrays.
    const result = await api<Item[] | { items: Item[] }>(`${base}${collection.listQuery ?? ''}`, { auth: true });
    return Array.isArray(result) ? result : result.items;
  }, [base, collection.listQuery]);

  const load = useCallback(() => {
    fetchItems().then(setItems, (e: Error) => setLoadError(e.message));
  }, [fetchItems]);
  useEffect(load, [load]);

  /** A toast: a success one goes away by itself, an error one stays until closed. */
  const dismiss = (id: number) => setToasts((list) => list.filter((toast) => toast.id !== id));
  const notify = (text: string, error = false) => {
    const id = ++lastToast.current;
    setToasts((list) => [...list, { id, text, error }]);
    if (!error) setTimeout(() => dismiss(id), 4000);
  };

  // The form lives in a native modal <dialog>: opened while `editing` is set (focus trap and backdrop for free).
  const isEditing = editing !== null;
  // The last form stays rendered while the dialog fades out (styles.css), instead of emptying it mid-exit.
  const [lastEditing, setLastEditing] = useState(editing);
  if (editing && editing !== lastEditing) setLastEditing(editing);
  const shown = editing ?? lastEditing;
  const locked = saving || uploading; // the form can't close mid-save or mid-upload
  const dirty = editing !== null && JSON.stringify(editing.values) !== JSON.stringify(editing.initial);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isEditing && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('input, textarea, select')?.focus(); // not the close button
    }
    if (!isEditing && dialog.open) dialog.close();
  }, [isEditing]);
  useSaveShortcut(submitRef, isEditing);
  // Leaving the page (reload, closing the tab) with unsaved changes: the browser asks first. In-app links can't be reached
  // meanwhile (the modal makes the page inert).
  // ponytail: the browser's Back still leaves without asking; that needs a data router (useBlocker).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The confirmation dialog stays rendered after closing (for its exit), until the next question replaces it.
  useEffect(() => {
    if (confirmation) confirmRef.current?.showModal(); // focuses its first button: the safe choice
  }, [confirmation]);

  /** ✕, Cancelar and Esc: nothing while saving or uploading; with unsaved changes, asks first. */
  const closeForm = () => {
    if (locked) return;
    if (!dirty) return setEditing(null);
    setConfirmation({
      title: 'Descartar alterações?',
      message: 'O que você mudou neste formulário ainda não foi salvo.',
      confirm: 'Descartar',
      cancel: 'Continuar editando',
      onConfirm: () => setEditing(null),
    });
  };

  /** Saves a change to one row in the background, with a spinner on it. If it fails: an error toast, then `undo`. */
  const saveRow = async (id: string, request: () => Promise<unknown>, undo?: () => Promise<void>) => {
    setPending((ids) => [...ids, id]);
    try {
      await request();
    } catch (e) {
      notify((e as Error).message, true);
      await undo?.();
    }
    setPending((ids) => ids.filter((pendingId) => pendingId !== id));
  };

  /**
   * Show/hide and reorder: the list changes at once, then is saved. If saving fails, it goes back to what the API has
   * (also right when another change landed meanwhile), or to `before` when the API can't be reached.
   * ponytail: reorders started from two rows at once may reach the API out of order; queue them if that ever shows.
   */
  const change = (id: string, next: Item[], request: () => Promise<unknown>, before = items) => {
    setItems(next);
    void saveRow(id, request, async () => setItems(await fetchItems().catch(() => before)));
  };

  const reorder = (list: Item[]) => () => api(`${base}/reorder`, { method: 'PATCH', json: { ids: list.map((item) => item.id) }, auth: true });

  const move = (list: Item[], index: number, offset: number) => {
    const next = [...list];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    change(list[index].id, next, reorder(next));
  };

  const toggle = (list: Item[], item: Item) =>
    change(
      item.id,
      list.map((i) => (i.id === item.id ? { ...i, visible: !i.visible } : i)),
      () => api(`${base}/${item.id}`, { method: 'PATCH', json: { visible: !item.visible }, auth: true }),
    );

  const remove = (item: Item) =>
    setConfirmation({
      title: `Excluir ${collection.item}?`,
      message: [`Esta ação exclui “${collection.summary(item)}” permanentemente.`, collection.deleteWarning].filter(Boolean).join(' '),
      confirm: 'Excluir',
      onConfirm: () =>
        void saveRow(item.id, async () => {
          await api(`${base}/${item.id}`, { method: 'DELETE', auth: true });
          setItems((list) => list?.filter((i) => i.id !== item.id));
          notify('Item excluído.');
        }),
    });

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
    const order = (items: Item[]) => items.map((item) => item.id).join();
    if (dragId && order(list) !== order(itemsBeforeDrag.current)) change(dragId, list, reorder(list), itemsBeforeDrag.current);
  };

  const openForm = (item?: Item) => {
    const values = toFormValues(collection.fields, item);
    setFormError(undefined);
    setEditing({ id: item?.id, values, initial: values });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const json = toPayload(collection.fields, editing.values);
    setSaving(true);
    setFormError(undefined);
    try {
      await (editing.id ? api(`${base}/${editing.id}`, { method: 'PATCH', json, auth: true }) : api(base, { method: 'POST', json, auth: true }));
    } catch (e) {
      setFormError((e as Error).message);
      return;
    } finally {
      setSaving(false);
    }
    setEditing(null);
    notify('Item salvo.');
    fetchItems().then(setItems, (e: Error) => notify(e.message, true));
  };

  return (
    <section>
      <div className="admin-title">
        <h1>{collection.title}</h1>
        <button type="button" className="button button-accent" onClick={() => openForm()}>
          {collection.newItem}
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="modal-title"
        // Esc on the keydown: Chrome lets a second Esc through a cancel handler that already said no.
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          closeForm();
        }}
        // Esc with nothing focused, Android's back.
        onCancel={(event) => {
          event.preventDefault();
          closeForm();
        }}
        // A close the page didn't ask for (a browser letting a repeated back through): the form goes with it.
        onClose={() => setEditing(null)}
        // A file dropped outside the image field: not opened by the browser (which would leave the page and lose the form).
        // Files only: dragged text still drops into inputs.
        onDragOver={refuseFiles}
        onDrop={refuseFiles}
      >
        {shown && (
          <form className="form field-grid" onSubmit={(event) => void save(event)}>
            <div className="modal-header">
              <h2 id="modal-title">{shown.id ? `Editar ${collection.item}` : collection.newItem}</h2>
              <button type="button" className="button button-small" aria-label="Fechar" disabled={locked} onClick={closeForm}>
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
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="actions form-footer">
              <button ref={submitRef} type="submit" className="button button-accent" disabled={locked} aria-busy={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button type="button" className="button" disabled={locked} onClick={closeForm}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </dialog>

      <dialog ref={confirmRef} className="modal confirm" role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        {confirmation && (
          <div className="form">
            <h2 id="confirm-title">{confirmation.title}</h2>
            <p id="confirm-message">{confirmation.message}</p>
            <div className="actions">
              <button type="button" className="button" onClick={() => confirmRef.current?.close()}>
                {confirmation.cancel ?? 'Cancelar'}
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={() => {
                  confirmRef.current?.close();
                  confirmation.onConfirm();
                }}
              >
                {confirmation.confirm}
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* Mounted before any toast, so screen readers announce what comes in; errors as alerts. In <body>: fixed to the
          viewport, whatever the admin's boxes contain. */}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={toast.error ? 'toast toast-error' : 'toast'} role={toast.error ? 'alert' : undefined}>
              <p>{toast.text}</p>
              {toast.error && (
                <button type="button" className="button button-small" aria-label="Fechar aviso" onClick={() => dismiss(toast.id)}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}

      {!items ? (
        loadError ? (
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
        )
      ) : items.length === 0 ? (
        <p className="muted empty">Nada aqui ainda. Use “{collection.newItem}” para começar.</p>
      ) : (
        <ol className="admin-list">
          {items.map((item, index) => {
            const busy = pending.includes(item.id);
            return (
              <li
                key={item.id}
                className={[item.visible ? '' : 'hidden-item', item.id === dragId ? 'dragging' : ''].join(' ').trim() || undefined}
                aria-busy={busy || undefined}
                draggable={pending.length === 0}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', item.id); // Firefox only starts a drag with data set.
                  itemsBeforeDrag.current = items;
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
                <button type="button" className="admin-list-summary" onClick={() => openForm(item)}>
                  {collection.summary(item)}
                  {!item.visible && <small> (oculto)</small>}
                  {missingEnglish(collection.fields, item) && (
                    <small className="tag tag-accent" title="Há textos sem a versão em inglês">
                      sem EN
                    </small>
                  )}
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
                  <button type="button" className="button button-small" aria-label="Subir" disabled={busy || index === 0} onClick={() => move(items, index, -1)}>
                    ↑
                  </button>
                  <button type="button" className="button button-small" aria-label="Descer" disabled={busy || index === items.length - 1} onClick={() => move(items, index, 1)}>
                    ↓
                  </button>
                  <button type="button" className="button button-small" disabled={busy} onClick={() => toggle(items, item)}>
                    {item.visible ? 'Ocultar' : 'Mostrar'}
                  </button>
                  <button type="button" className="button button-small" onClick={() => openForm(item)}>
                    Editar
                  </button>
                  <button type="button" className="button button-small button-danger" disabled={busy} onClick={() => remove(item)}>
                    Excluir
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
