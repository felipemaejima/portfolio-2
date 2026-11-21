// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, api } from '../lib/api';
import { LangProvider } from '../lib/i18n';
import { ContactForm } from './ContactForm';

vi.mock('../lib/api', async (original) => ({ ...(await original<typeof import('../lib/api')>()), api: vi.fn() }));
const mockApi = vi.mocked(api);

beforeEach(() => localStorage.setItem('lang', 'pt'));
afterEach(() => {
  cleanup();
  mockApi.mockReset();
});

/** Fills and sends the form; resolves with the status line's text once the request settled. */
async function send() {
  render(
    <LangProvider>
      <ContactForm />
    </LangProvider>,
  );
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@test.dev' } });
  fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Oi' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
  await screen.findByRole('button', { name: 'Enviar mensagem' }); // back from "Enviando…"
  return screen.getByRole('status').textContent;
}

it('sends the message with an empty honeypot and confirms on success', async () => {
  mockApi.mockResolvedValue(undefined);
  expect(await send()).toBe('Mensagem enviada. Obrigado!');
  expect(mockApi).toHaveBeenCalledWith('/contact', {
    method: 'POST',
    json: { name: 'Ana', email: 'ana@test.dev', message: 'Oi', honeypot: '' },
  });
});

it('shows an error, never a false success, when the message could not be delivered', async () => {
  mockApi.mockRejectedValue(new ApiError(502, 'Discord did not accept the message'));
  expect(await send()).toBe(
    'Não foi possível enviar a mensagem agora. Tente de novo em instantes ou use os canais ao lado.',
  );
});

it('asks to check the fields when the API rejects them (blank text gets past the browser)', async () => {
  mockApi.mockRejectedValue(new ApiError(400, 'name must not be blank'));
  expect(await send()).toBe('Confira os campos: nome e mensagem não podem ficar em branco.');
});
