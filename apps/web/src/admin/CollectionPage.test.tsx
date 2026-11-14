import { beforeEach, expect, it, vi } from 'vitest';
import { CollectionPage } from './CollectionPage';
import { COLLECTIONS } from './collections';
import { FieldInput } from './fields';

// No DOM in these tests: a minimal useState keeps state across renders like React does, so the page's handlers can be
// replayed in the order a slow upload produces (handler captured at the upload's start, called after later edits).
const hooks = vi.hoisted(() => ({ state: [] as unknown[], next: 0 }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = hooks.next++;
    if (!(i in hooks.state)) hooks.state[i] = initial;
    const set = (value: unknown) => (hooks.state[i] = typeof value === 'function' ? value(hooks.state[i]) : value);
    return [hooks.state[i], set];
  },
  useEffect: () => {},
  useRef: (current: unknown) => ({ current }),
  useCallback: (fn: unknown) => fn,
}));

type Element = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
const elements = (node: unknown): Element[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  return node && typeof node === 'object' && 'props' in node ? [node as Element, ...elements((node as Element).props.children)] : [];
};

const projects = COLLECTIONS.find((c) => c.path === 'projects')!;
const render = () => {
  hooks.next = 0;
  return elements(CollectionPage({ collection: projects }));
};
type FieldProps = Parameters<typeof FieldInput>[0];
/** The props a fresh render passes to a field: its current values and handlers. */
const field = (key: string) => render().find((el) => el.type === FieldInput && (el.props as FieldProps).field.key === key)!.props as FieldProps;

beforeEach(() => {
  hooks.state = [];
  (render().find((el) => el.props.children === 'Novo item')!.props.onClick as () => void)();
});

it('keeps what was typed while an image uploads', () => {
  const finishUpload = field('imageMediaId').onChange; // the handler the upload started with
  field('title').onChange({ title: { pt: 'Meu projeto', en: '' } });
  finishUpload({ imageMediaId: 'media-1', imageUrl: '/uploads/media-1.webp' });

  expect(field('title').values).toMatchObject({ title: { pt: 'Meu projeto' }, imageMediaId: 'media-1' });
});

it('locks save and cancel while an image uploads', () => {
  const buttons = () => render().filter((el) => el.type === 'button' && ['Salvar', 'Cancelar'].includes(el.props.children as string));
  field('imageMediaId').onUploading!(true);
  expect(buttons().map((el) => el.props.disabled)).toEqual([true, true]);

  field('imageMediaId').onUploading!(false);
  expect(buttons().map((el) => el.props.disabled)).toEqual([false, false]);
});
