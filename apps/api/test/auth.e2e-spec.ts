import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ADMIN, createAdmin, createApp, resetDb } from './helpers';

describe('auth', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;

  // A fresh app per test resets the in-memory rate limiter.
  beforeEach(async () => {
    app = await createApp();
    await resetDb(app);
    await createAdmin(app);
    http = request(app.getHttpServer());
  });
  afterEach(() => app.close());

  const login = (body = ADMIN) => http.post('/auth/login').send(body);
  const refreshCookie = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refresh_token='))!;
  const refresh = (cookie: string) => http.post('/auth/refresh').set('Cookie', cookie.split(';')[0]);

  it('rejects wrong password and unknown email with the same generic error', async () => {
    const wrongPassword = await login({ ...ADMIN, password: 'nope-nope-nope' }).expect(401);
    const unknownEmail = await login({ ...ADMIN, email: 'ghost@test.dev' }).expect(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('requires a valid bearer token on admin routes', async () => {
    await http.get('/admin/services').expect(401);
    await http.get('/admin/services').set('Authorization', 'Bearer not-a-jwt').expect(401);

    const { body } = await login().expect(200);
    await http.get('/admin/services').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
  });

  it('does not accept a refresh token as an access token', async () => {
    const cookie = refreshCookie(await login().expect(200));
    const refreshToken = cookie.split(';')[0].split('=')[1];
    await http.get('/admin/services').set('Authorization', `Bearer ${refreshToken}`).expect(401);
  });

  it('sets the refresh token in a hardened cookie and rotates it on refresh', async () => {
    const cookie = refreshCookie(await login().expect(200));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/auth\/refresh/);

    const res = await refresh(cookie).expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookie(res).split(';')[0]).not.toBe(cookie.split(';')[0]);
  });

  it('logout invalidates every refresh token', async () => {
    const res = await login().expect(200);
    await http.post('/auth/logout').set('Authorization', `Bearer ${res.body.accessToken}`).expect(204);
    await refresh(refreshCookie(res)).expect(401);
  });

  it('password change requires the current password and ends sessions', async () => {
    const res = await login().expect(200);
    const auth = `Bearer ${res.body.accessToken}`;
    const newPassword = 'another-long-password';

    await http
      .patch('/admin/account/password')
      .set('Authorization', auth)
      .send({ currentPassword: 'wrong-password', newPassword })
      .expect(403);
    await http
      .patch('/admin/account/password')
      .set('Authorization', auth)
      .send({ currentPassword: ADMIN.password, newPassword: '1234' })
      .expect(400);
    await http
      .patch('/admin/account/password')
      .set('Authorization', auth)
      .send({ currentPassword: ADMIN.password, newPassword })
      .expect(204);

    await refresh(refreshCookie(res)).expect(401);
    await login().expect(401);
    await login({ ...ADMIN, password: newPassword }).expect(200);
  });

  it('rate-limits login attempts', async () => {
    for (let i = 0; i < 5; i++) await login({ ...ADMIN, password: 'wrong-password' }).expect(401);
    await login().expect(429);
  });
});
