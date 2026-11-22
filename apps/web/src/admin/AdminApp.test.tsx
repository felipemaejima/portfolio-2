// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, refreshSession } from '../lib/api';
import { announceVisit } from '../lib/visit';
import { AdminApp } from './AdminApp';

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: vi.fn(),
  refreshSession: vi.fn(),
}));
const mockApi = vi.mocked(api);

const openAdmin = (url = '/admin') => {
  const router = createMemoryRouter([{ path: '/admin/*', element: <AdminApp /> }], { initialEntries: [url] });
  render(<RouterProvider router={router} />);
  return router;
};

beforeEach(() => {
  localStorage.clear();
  mockApi.mockReset();
  mockApi.mockReturnValue(new Promise(() => {})); // the panel's pages just keep loading
});
afterEach(cleanup);

it('marks the browser as the admin\'s when the panel restores a session on load: it never announces a Visita', async () => {
  vi.mocked(refreshSession).mockResolvedValue(true);
  openAdmin();
  await screen.findByRole('button', { name: 'Sair' });

  announceVisit('/', 'pt');
  expect(mockApi).not.toHaveBeenCalledWith('/visits', expect.anything());
});

it('leaves a browser that only reached the login form unmarked', async () => {
  vi.mocked(refreshSession).mockResolvedValue(false);
  openAdmin();
  await screen.findByRole('button', { name: 'Entrar' });

  announceVisit('/', 'pt');
  expect(mockApi).toHaveBeenCalledWith('/visits', expect.anything());
});

it('offers the Login pelo Google as a plain link to the API, which takes the browser to Google', async () => {
  vi.mocked(refreshSession).mockResolvedValue(false);
  openAdmin();
  const link = await screen.findByRole('link', { name: 'Entrar com Google' });
  expect(link.getAttribute('href')).toBe('/api/auth/google');
});

it.each([
  ['nao-vinculada', 'Essa conta Google não está vinculada.'],
  ['erro', 'Não foi possível entrar com Google.'],
])('back from Google with ?google=%s, says "%s" and takes it off the URL', async (failure, message) => {
  vi.mocked(refreshSession).mockResolvedValue(false);
  const router = openAdmin(`/admin?google=${failure}`);
  expect((await screen.findByRole('alert')).textContent).toBe(message);
  expect(router.state.location.search).toBe('');
});

it('says nothing when the admin cancelled on Google', async () => {
  vi.mocked(refreshSession).mockResolvedValue(false);
  const router = openAdmin('/admin?google=cancelado');
  await screen.findByRole('button', { name: 'Entrar' });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(router.state.location.search).toBe('');
});
