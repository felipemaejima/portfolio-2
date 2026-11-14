import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, login } from './api';

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const headersOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>;

describe('api client (CloudFront OAC contract)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('signs bodies with their SHA-256 and sends the token in X-Authorization', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(200, { accessToken: 'token-1' })).mockResolvedValueOnce(json(201, {}));
    vi.stubGlobal('fetch', fetch);

    await login('a@b.dev', 'secret');
    await api('/admin/services', { method: 'POST', json: { title: { pt: 'Olá' } }, auth: true });

    const loginHeaders = headersOf(fetch.mock.calls[0]);
    expect(loginHeaders['x-amz-content-sha256']).toBe(sha256('{"email":"a@b.dev","password":"secret"}'));
    const createHeaders = headersOf(fetch.mock.calls[1]);
    expect(createHeaders['X-Authorization']).toBe('Bearer token-1');
    expect(createHeaders['x-amz-content-sha256']).toBe(sha256('{"title":{"pt":"Olá"}}'));
    expect(createHeaders.Authorization).toBeUndefined();
  });

  it('hashes raw file uploads and empty bodies', async () => {
    const fetch = vi.fn().mockResolvedValue(json(201, {}));
    vi.stubGlobal('fetch', fetch);
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    await api('/admin/uploads', { method: 'POST', file: new Blob([bytes], { type: 'image/png' }), auth: true });
    await api('/auth/logout', { method: 'POST', auth: true });

    expect(headersOf(fetch.mock.calls[0])['x-amz-content-sha256']).toBe(sha256(bytes));
    expect(headersOf(fetch.mock.calls[0])['Content-Type']).toBe('image/png');
    expect(headersOf(fetch.mock.calls[1])['x-amz-content-sha256']).toBe(sha256(''));
  });

  it('renews an expired token once with the refresh cookie and retries', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(json(200, { accessToken: 'token-2' }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    vi.stubGlobal('fetch', fetch);

    await expect(api('/admin/profile', { auth: true })).resolves.toEqual({ ok: true });
    expect(fetch.mock.calls[1][0]).toBe('/api/auth/refresh');
    expect(headersOf(fetch.mock.calls[2])['X-Authorization']).toBe('Bearer token-2');
  });

  it('asks the admin to log in again when the session cannot be renewed', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }));
    vi.stubGlobal('fetch', fetch);

    await expect(api('/admin/profile', { auth: true })).rejects.toEqual(new ApiError(401, 'Sessão expirada: entre de novo.'));
  });

  it('shows common admin errors in Portuguese, keeping specific messages and the public site as they are', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(400, { message: ['tags.0 must be shorter than or equal to 40 characters'] }))
      .mockResolvedValueOnce(json(409, { message: 'Resource is referenced by another record' }))
      .mockResolvedValueOnce(new Response('<html>413</html>', { status: 413 })) // CloudFront's page, not JSON
      .mockResolvedValueOnce(json(400, { message: 'newPassword must be at least 12 characters' }))
      .mockResolvedValueOnce(json(400, { message: ['email must be an email'] }));
    vi.stubGlobal('fetch', fetch);
    const admin = () => api('/admin/projects', { method: 'POST', json: {}, auth: true });

    await expect(admin()).rejects.toThrow('Dados inválidos');
    await expect(admin()).rejects.toThrow('em uso por outro registro');
    await expect(admin()).rejects.toThrow('até 4 MB');
    await expect(admin()).rejects.toThrow('newPassword must be at least 12 characters');
    await expect(api('/contact', { method: 'POST', json: {} })).rejects.toThrow('email must be an email');
  });
});
