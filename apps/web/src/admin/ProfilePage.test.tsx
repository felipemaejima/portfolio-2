// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ProfilePage } from './ProfilePage';

vi.mock('../lib/api', () => ({ api: vi.fn() }));
const mockApi = vi.mocked(api);

// What jsdom lacks: modal dialogs.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new Event('close'));
};

const text = (pt: string) => ({ pt, en: '' });
const profile = {
  name: 'Felipe',
  headline: text('Desenvolvedor'),
  summary: text('Resumo'),
  location: text('São Paulo'),
  availability: text('Imediata'),
  workModality: text('Remoto'),
  spokenLanguages: text('Português'),
};
/** The page as the admin has it: in a data router, one step after a collection, with a link back to it. */
const renderPage = async () => {
  const router = createMemoryRouter(
    [
      { path: '/admin/projects', element: <h1>Projetos</h1> },
      {
        path: '/admin',
        element: (
          <>
            <Link to="/admin/projects">Projetos</Link>
            <ProfilePage />
          </>
        ),
      },
    ],
    { initialEntries: ['/admin/projects', '/admin'], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  await settle();
  return router;
};
/** Lets pending API calls settle and React re-render. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(0));
const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  await settle();
};

beforeEach(() => {
  vi.useFakeTimers();
  mockApi.mockReset();
  mockApi.mockImplementation(async (path, options) => (options?.method ? undefined : profile));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('saving shows "Perfil salvo." as a toast that goes away by itself', async () => {
  await renderPage();
  await save();
  expect(mockApi).toHaveBeenCalledWith('/admin/profile', expect.objectContaining({ method: 'PUT' }));
  expect(screen.getByText('Perfil salvo.')).toBeDefined();

  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(screen.queryByText('Perfil salvo.')).toBeNull();
});

it('an error saving stays on screen until closed', async () => {
  mockApi.mockImplementation(async (path, options) => {
    if (options?.method) throw new Error('Sem conexão.');
    return profile;
  });
  await renderPage();
  await save();
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(screen.getByRole('alert').textContent).toContain('Sem conexão.');

  fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
  expect(screen.queryByRole('alert')).toBeNull();
});

/** Whether closing or reloading the tab now makes the browser ask first. */
const tabCloseWarns = () => !dispatchEvent(new Event('beforeunload', { cancelable: true }));
const typeName = (value: string) => fireEvent.change(screen.getByLabelText('Nome'), { target: { value } });

it('warns on closing or reloading the tab only while there are unsaved changes', async () => {
  await renderPage();
  expect(tabCloseWarns()).toBe(false);

  typeName('Felipe Maejima');
  expect(tabCloseWarns()).toBe(true);
  typeName('Felipe');
  expect(tabCloseWarns()).toBe(false); // back to what was loaded

  typeName('Felipe Maejima');
  await save();
  expect(tabCloseWarns()).toBe(false); // what was saved is the new starting point
});

const leaveBy = {
  Back: async (router: Awaited<ReturnType<typeof renderPage>>) => {
    await act(async () => void router.navigate(-1));
    await settle();
  },
  'a link': async () => {
    fireEvent.click(screen.getByRole('link', { name: 'Projetos' }));
    await settle();
  },
};
const left = () => screen.queryByRole('heading', { name: 'Projetos' }) !== null;
const confirmDialog = () => screen.getByRole('alertdialog') as HTMLDialogElement;

it.each(Object.entries(leaveBy))('leaving by %s with unsaved changes asks first: Continuar editando stays, Descartar leaves', async (_, leave) => {
  const router = await renderPage();
  typeName('Felipe Maejima');

  await leave(router);
  expect(confirmDialog().open).toBe(true);
  expect(confirmDialog().textContent).toContain('Descartar alterações?');
  fireEvent.click(within(confirmDialog()).getByRole('button', { name: 'Continuar editando' }));
  await settle();
  expect(left()).toBe(false);
  expect(screen.getByLabelText('Nome')).toHaveProperty('value', 'Felipe Maejima');

  await leave(router);
  fireEvent.click(within(confirmDialog()).getByRole('button', { name: 'Descartar' }));
  await settle();
  expect(left()).toBe(true);
});

it.each(Object.entries(leaveBy))('leaving by %s without changes goes at once', async (_, leave) => {
  const router = await renderPage();
  await leave(router);
  expect(left()).toBe(true);
  expect(screen.queryByRole('alertdialog')).toBeNull();
});
