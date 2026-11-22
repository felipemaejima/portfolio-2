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

const openAdmin = () =>
  render(<RouterProvider router={createMemoryRouter([{ path: '/admin/*', element: <AdminApp /> }], { initialEntries: ['/admin'] })} />);

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
