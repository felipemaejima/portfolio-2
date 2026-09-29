import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import type { Collection } from './collections';
import { FieldInput, toFormValues, toPayload } from './fields';

type Item = Record<string, unknown> & { id: string; visible: boolean };

/** List (in display order), reorder, show/hide, create, edit and delete — for any collection in collections.ts. */
export function CollectionPage({ collection }: { collection: Collection }) {
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<{ id?: string; values: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string>();

  const base = `/admin/${collection.path}`;
  const fetchItems = useCallback(async () => {
    // Projects come paginated ({ items }); the other collections are plain arrays.
    const result = await api<Item[] | { items: Item[] }>(`${base}${collection.listQuery ?? ''}`, { auth: true });
    return Array.isArray(result) ? result : result.items;
  }, [base, collection.listQuery]);

  useEffect(() => {
    fetchItems().then(setItems, (e: Error) => setError(e.message));
  }, [fetchItems]);

  const run = async (action: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await action();
      setItems(await fetchItems());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const move = (index: number, offset: number) => {
    const ids = items.map((item) => item.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    void run(() => api(`${base}/reorder`, { method: 'PATCH', json: { ids }, auth: true }));
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const json = toPayload(collection.fields, editing.values);
    void run(async () => {
      await (editing.id
        ? api(`${base}/${editing.id}`, { method: 'PATCH', json, auth: true })
        : api(base, { method: 'POST', json, auth: true }));
      setEditing(null);
    });
  };

  return (
    <section>
      <div className="admin-title">
        <h1>{collection.title}</h1>
        <button type="button" className="button button-accent" onClick={() => setEditing({ values: toFormValues(collection.fields) })}>
          Novo
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}

      {editing && (
        <form className="form admin-form" onSubmit={save}>
          <h2>{editing.id ? 'Editar' : 'Novo item'}</h2>
          {collection.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              values={editing.values}
              onChange={(changes) => setEditing({ ...editing, values: { ...editing.values, ...changes } })}
            />
          ))}
          <div className="actions">
            <button type="submit" className="button button-accent">
              Salvar
            </button>
            <button type="button" className="button" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <ol className="admin-list">
        {items.map((item, index) => (
          <li key={item.id} className={item.visible ? undefined : 'hidden-item'}>
            <span className="admin-list-summary">
              {collection.summary(item)}
              {!item.visible && <small> (oculto)</small>}
            </span>
            <button type="button" className="button button-small" aria-label="Subir" disabled={index === 0} onClick={() => move(index, -1)}>
              ↑
            </button>
            <button type="button" className="button button-small" aria-label="Descer" disabled={index === items.length - 1} onClick={() => move(index, 1)}>
              ↓
            </button>
            <button
              type="button"
              className="button button-small"
              onClick={() => void run(() => api(`${base}/${item.id}`, { method: 'PATCH', json: { visible: !item.visible }, auth: true }))}
            >
              {item.visible ? 'Ocultar' : 'Mostrar'}
            </button>
            <button type="button" className="button button-small" onClick={() => setEditing({ id: item.id, values: toFormValues(collection.fields, item) })}>
              Editar
            </button>
            <button
              type="button"
              className="button button-small button-danger"
              onClick={() => {
                if (confirm('Excluir este item?')) void run(() => api(`${base}/${item.id}`, { method: 'DELETE', auth: true }));
              }}
            >
              Excluir
            </button>
          </li>
        ))}
      </ol>
      {items.length === 0 && <p className="muted">Nenhum item ainda.</p>}
    </section>
  );
}
