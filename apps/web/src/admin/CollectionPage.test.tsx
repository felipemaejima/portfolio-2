// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { CollectionPage } from './CollectionPage';
import { COLLECTIONS } from './collections';

vi.mock('../lib/api', () => ({ api: vi.fn() }));
const mockApi = vi.mocked(api);

// What jsdom lacks: modal dialogs, popovers, and the image decoding and previews of an upload.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new Event('close'));
};
HTMLElement.prototype.hidePopover = () => {};
URL.createObjectURL = () => 'blob:preview';
URL.revokeObjectURL = () => {};
vi.stubGlobal('createImageBitmap', async () => ({ width: 100, height: 100, close: () => {} }));

const collection = (path: string) => COLLECTIONS.find((c) => c.path === path)!;
/** The page as the admin has it: in a data router, one step after the Perfil page, with a link back to it. */
const renderPage = (path = 'projects') => {
  const router = createMemoryRouter(
    [
      { path: '/admin', element: <h1>Perfil</h1> },
      {
        path: '/admin/:collection',
        element: (
          <>
            <Link to="/admin">Perfil</Link>
            <CollectionPage collection={collection(path)} />
          </>
        ),
      },
    ],
    { initialEntries: ['/admin', `/admin/${path}`], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
};
const project = { id: 'p1', title: { pt: 'Site', en: 'Site' }, description: { pt: 'Um site', en: 'A site' }, tags: [], visible: true };
/** Lets pending API calls settle and React re-render. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(0));
const deferred = () => {
  let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const openDialog = () => screen.getAllByRole('dialog').find((dialog) => (dialog as HTMLDialogElement).open)!;
const confirmDialog = () => screen.getByRole('alertdialog') as HTMLDialogElement;
/** A row's action button: in a popover (the phones' ⋯ sheet), which jsdom counts as hidden. */
const action = (name: string, row = screen.getByRole('listitem')) => within(row).getByRole('button', { name, hidden: true });
const typeIn = (label: string, value: string) => fireEvent.change(within(openDialog()).getAllByLabelText(label)[0], { target: { value } });

beforeEach(() => {
  vi.useFakeTimers();
  mockApi.mockReset();
  mockApi.mockImplementation(async (path, options) => (!options?.method ? [project] : undefined));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const openNewProject = async () => {
  const router = renderPage();
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
  return router;
};

it('keeps what was typed while an image uploads, and locks save and cancel until it lands', async () => {
  const upload = deferred();
  mockApi.mockImplementation(async (path, options) => (path === '/admin/uploads' ? upload.promise : !options?.method ? [project] : undefined));
  await openNewProject();
  const buttons = () => ['Salvar', 'Cancelar'].map((name) => (within(openDialog()).getByRole('button', { name }) as HTMLButtonElement).disabled);

  fireEvent.change(openDialog().querySelector('input[type=file]')!, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
  await settle();
  typeIn('PT', 'Meu projeto');
  expect(buttons()).toEqual([true, true]);

  upload.resolve({ id: 'media-1', url: '/uploads/media-1.webp' });
  await settle();
  expect(within(openDialog()).getAllByLabelText('PT')[0]).toHaveProperty('value', 'Meu projeto');
  expect(openDialog().querySelector('img')).toHaveProperty('src', expect.stringContaining('/uploads/media-1.webp'));
  expect(buttons()).toEqual([false, false]);
});

it('shows a hidden item at once, and puts it back with an error toast when saving fails', async () => {
  const saving = deferred();
  mockApi.mockImplementation(async (path, options) => (options?.method === 'PATCH' ? saving.promise : [project]));
  renderPage();
  await settle();

  fireEvent.click(action('Ocultar'));
  expect(action('Mostrar')).toBeDefined();
  expect(screen.getByRole('listitem').getAttribute('aria-busy')).toBe('true');
  expect(mockApi).toHaveBeenCalledTimes(1 + 1); // the first load and the PATCH: no list reload

  saving.reject(new Error('Sem conexão.'));
  await settle();
  expect(action('Ocultar')).toBeDefined();
  expect(screen.getByRole('alert').textContent).toContain('Sem conexão.');
});

it('closes an untouched form at once, and asks before discarding changes', async () => {
  await openNewProject();
  fireEvent.click(within(openDialog()).getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryAllByRole('dialog').some((d) => (d as HTMLDialogElement).open)).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
  typeIn('PT', 'Meu projeto');
  fireEvent.keyDown(openDialog(), { key: 'Escape' });
  expect(confirmDialog().open).toBe(true);
  fireEvent.click(within(confirmDialog()).getByRole('button', { name: 'Continuar editando' }));
  expect(within(openDialog()).getAllByLabelText('PT')[0]).toHaveProperty('value', 'Meu projeto');

  fireEvent.click(within(openDialog()).getByRole('button', { name: 'Fechar' }));
  fireEvent.click(within(confirmDialog()).getByRole('button', { name: 'Descartar' }));
  expect(screen.queryAllByRole('dialog').some((d) => (d as HTMLDialogElement).open)).toBe(false);
});

const leaveBy = {
  Back: async (router: ReturnType<typeof renderPage>) => {
    await act(async () => void router.navigate(-1));
    await settle();
  },
  'a link': async () => {
    fireEvent.click(screen.getByRole('link', { name: 'Perfil' }));
    await settle();
  },
};
const onProfile = () => screen.queryByRole('heading', { name: 'Perfil' }) !== null;

it.each(Object.entries(leaveBy))('leaving by %s with unsaved changes asks first: Continuar editando stays, Descartar leaves', async (_, leave) => {
  const router = await openNewProject();
  typeIn('PT', 'Meu projeto');

  await leave(router);
  expect(confirmDialog().open).toBe(true);
  expect(confirmDialog().textContent).toContain('Descartar alterações?');
  fireEvent.click(within(confirmDialog()).getByRole('button', { name: 'Continuar editando' }));
  await settle();
  expect(onProfile()).toBe(false);
  expect(within(openDialog()).getAllByLabelText('PT')[0]).toHaveProperty('value', 'Meu projeto');

  await leave(router);
  expect(confirmDialog().open).toBe(true);
  fireEvent.click(within(confirmDialog()).getByRole('button', { name: 'Descartar' }));
  await settle();
  expect(onProfile()).toBe(true);
});

it.each(Object.entries(leaveBy))('leaving by %s without changes goes at once', async (_, leave) => {
  const router = await openNewProject();
  await leave(router);
  expect(onProfile()).toBe(true);
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('saves the open form with Ctrl+S instead of saving the page', async () => {
  await openNewProject();
  typeIn('PT', 'Meu projeto');
  fireEvent.change(within(openDialog()).getAllByLabelText('PT')[1], { target: { value: 'Descrição' } });

  const shortcut = fireEvent.keyDown(within(openDialog()).getAllByLabelText('PT')[1], { key: 's', ctrlKey: true });
  await settle();
  expect(shortcut).toBe(false); // default prevented
  expect(mockApi).toHaveBeenCalledWith('/admin/projects', expect.objectContaining({ method: 'POST' }));
});

it('names what a delete takes along; success toasts go away by themselves, error ones stay until closed', async () => {
  const categories = [
    { id: 'c1', name: { pt: 'Back-end' }, visible: true },
    { id: 'c2', name: { pt: 'Front-end' }, visible: true },
  ];
  mockApi.mockImplementation(async (path, options) => {
    if (options?.method === 'PATCH') throw new Error('Sem conexão.');
    return options?.method ? undefined : categories;
  });
  renderPage('skill-categories');
  await settle();
  const [backEnd, frontEnd] = screen.getAllByRole('listitem');

  fireEvent.click(action('Excluir', backEnd));
  expect(confirmDialog().textContent).toContain('“Back-end”');
  expect(confirmDialog().textContent).toContain('As habilidades desta categoria também serão excluídas.');
  fireEvent.click(within(confirmDialog()).getByRole('button', { name: 'Excluir' }));
  await settle();
  expect(screen.getByText('Item excluído.')).toBeDefined();
  expect(screen.getAllByRole('listitem')).toEqual([frontEnd]);

  fireEvent.click(action('Ocultar', frontEnd));
  await settle();
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(screen.queryByText('Item excluído.')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('Sem conexão.');

  fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
  expect(screen.queryByRole('alert')).toBeNull();
});
