import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBlocker, useSearchParams, type Blocker } from 'react-router';

/** A question in the confirmation dialog (delete, discard changes). `onCancel`: on its cancel button and Esc. */
type Confirmation = { title: string; message: string; confirm: string; cancel?: string; onConfirm: () => void; onCancel?: () => void };

/**
 * The confirmation dialog: `ask` opens it with a question, `askDiscard` with "Descartar alterações?".
 * Render `dialog` once.
 */
export function useConfirmation() {
  const [confirmation, ask] = useState<Confirmation | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  // The dialog stays rendered after closing (for its exit), until the next question replaces it.
  useEffect(() => {
    if (confirmation) ref.current?.showModal(); // focuses its first button: the safe choice
  }, [confirmation]);

  const askDiscard = (onConfirm: () => void, onCancel?: () => void) =>
    ask({
      title: 'Descartar alterações?',
      message: 'O que você mudou neste formulário ainda não foi salvo.',
      confirm: 'Descartar',
      cancel: 'Continuar editando',
      onConfirm,
      onCancel,
    });
  const answer = (choice?: () => void) => {
    ref.current?.close();
    choice?.();
  };
  const dialog = (
    <dialog
      ref={ref}
      className="modal confirm"
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onCancel={() => confirmation?.onCancel?.()}
    >
      {confirmation && (
        <div className="form">
          <h2 id="confirm-title">{confirmation.title}</h2>
          <p id="confirm-message">{confirmation.message}</p>
          <div className="actions">
            <button type="button" className="button" onClick={() => answer(confirmation.onCancel)}>
              {confirmation.cancel ?? 'Cancelar'}
            </button>
            <button type="button" className="button button-danger" onClick={() => answer(confirmation.onConfirm)}>
              {confirmation.confirm}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
  return { ask, askDiscard, dialog };
}

/** A query parameter read once, on arrival, then taken off the URL: a reload or a copied link doesn't repeat it. */
export function useArrivalParam(name: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [value] = useState(() => searchParams.get(name));
  useEffect(() => {
    if (!searchParams.has(name)) return;
    setSearchParams(
      (params) => {
        params.delete(name);
        return params;
      },
      { replace: true },
    );
  }, [name, searchParams, setSearchParams]);
  return value;
}

/** Whether a form's values differ from the ones it started from (loaded or last saved). */
export const isDirty = (values: unknown, initial: unknown) => JSON.stringify(values) !== JSON.stringify(initial);

/**
 * While a form has unsaved changes (`dirty`): reloading or closing the tab makes the browser ask first, and Back or a
 * link asks with `askDiscard` (useConfirmation's).
 */
export function useUnsavedChangesGuard(dirty: boolean, askDiscard: (onConfirm: () => void, onCancel: () => void) => void) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Back or a link: the router holds the navigation while the question is asked (once per hold).
  const blocker = useBlocker(dirty);
  const [asked, setAsked] = useState<Blocker>();
  if (blocker.state === 'blocked' && asked !== blocker) {
    setAsked(blocker);
    askDiscard(blocker.proceed, blocker.reset);
  }
}

/** Toasts: `notify` adds one; a success one goes away by itself, an error one stays until closed. Render `toasts` once. */
export function useToasts() {
  const [list, setList] = useState<{ id: number; text: string; error?: boolean }[]>([]);
  const last = useRef(0);
  const dismiss = (id: number) => setList((current) => current.filter((toast) => toast.id !== id));
  const notify = (text: string, error = false) => {
    const id = ++last.current;
    setList((current) => [...current, { id, text, error }]);
    if (!error) setTimeout(() => dismiss(id), 4000);
  };

  // Mounted before any toast, so screen readers announce what comes in; errors as alerts. In <body>: fixed to the
  // viewport, whatever the admin's boxes contain.
  const toasts = createPortal(
    <div className="toasts" aria-live="polite">
      {list.map((toast) => (
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
  );
  return { notify, toasts };
}
