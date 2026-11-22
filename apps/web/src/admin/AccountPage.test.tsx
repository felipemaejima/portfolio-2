// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError, forgetSession } from '../lib/api';
import { AccountPage } from './AccountPage';

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: vi.fn(),
  forgetSession: vi.fn(),
}));
const mockApi = vi.mocked(api);

// What jsdom lacks: modal dialogs.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new Event('close'));
};

const onSessionEnded = vi.fn();
const openAccount = (url = '/admin/conta') => {
  const router = createMemoryRouter([{ path: '/admin/conta', element: <AccountPage onSessionEnded={onSessionEnded} /> }], {
    initialEntries: [url],
  });
  render(<RouterProvider router={router} />);
  return router;
};
/** The API as the page sees it: the Conta vinculada (or 404), and `onWrite` for POST and DELETE. */
const apiWith = (linked: { email: string } | null, onWrite: () => unknown = () => undefined) =>
  mockApi.mockImplementation(async (_path, options) => {
    if (options?.method) return onWrite();
    if (linked) return { ...linked, linkedAt: '2026-11-22T12:00:00.000Z' };
    throw new ApiError(404, 'Not Found');
  });
const googleSection = async () => within(await screen.findByRole('form', { name: 'Conta Google' }));

beforeEach(() => {
  mockApi.mockReset();
  onSessionEnded.mockReset();
  vi.mocked(forgetSession).mockReset();
});
afterEach(() => {
  cleanup();
  location.hash = '';
});

it('without a Conta vinculada, links with the current password and goes where the API says (Google)', async () => {
  const googleUrl = `${location.origin}/#google`; // a hash: the only navigation jsdom performs
  apiWith(null, () => ({ url: googleUrl }));
  openAccount();
  const section = await googleSection();

  fireEvent.change(await section.findByLabelText('Senha atual'), { target: { value: 'my-password' } });
  fireEvent.click(section.getByRole('button', { name: 'Vincular conta Google' }));

  await waitFor(() => expect(location.href).toBe(googleUrl));
  expect(mockApi).toHaveBeenCalledWith('/admin/account/google', {
    method: 'POST',
    json: { currentPassword: 'my-password' },
    auth: true,
  });
});

it('a wrong current password says so and lets the admin try again', async () => {
  apiWith(null, () => {
    throw new ApiError(403, 'Senha atual incorreta.');
  });
  openAccount();
  const section = await googleSection();

  fireEvent.change(await section.findByLabelText('Senha atual'), { target: { value: 'wrong' } });
  fireEvent.click(section.getByRole('button', { name: 'Vincular conta Google' }));

  expect((await section.findByRole('alert')).textContent).toBe('Senha atual incorreta.');
  expect((section.getByRole('button', { name: 'Vincular conta Google' }) as HTMLButtonElement).disabled).toBe(false);
});

it('with a Conta vinculada, shows its email; unlinking asks first, then ends the session', async () => {
  apiWith({ email: 'admin@gmail.com' });
  openAccount();
  const section = await googleSection();
  expect(await section.findByText('admin@gmail.com')).toBeDefined();

  fireEvent.click(section.getByRole('button', { name: 'Desvincular' }));
  expect(mockApi).not.toHaveBeenCalledWith('/admin/account/google', expect.objectContaining({ method: 'DELETE' }));
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desvincular' }));

  await waitFor(() => expect(onSessionEnded).toHaveBeenCalledWith('Conta Google desvinculada. Entre de novo.'));
  expect(mockApi).toHaveBeenCalledWith('/admin/account/google', { method: 'DELETE', auth: true });
  expect(forgetSession).toHaveBeenCalled();
});

it.each([
  ['vinculada', 'status', 'Conta Google vinculada.'],
  ['erro', 'alert', 'Não foi possível vincular a conta Google.'],
] as const)('back from Google with ?google=%s, says so (%s) and takes it off the URL', async (result, role, message) => {
  apiWith(result === 'vinculada' ? { email: 'admin@gmail.com' } : null);
  const router = openAccount(`/admin/conta?google=${result}`);
  expect((await (await googleSection()).findByRole(role)).textContent).toBe(message);
  await waitFor(() => expect(router.state.location.search).toBe('')); // taken off by an effect, after the render
});
