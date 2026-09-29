import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ADMIN, createAdmin, createApp, resetDb } from './helpers';

describe('auth', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createApp();
    http = request(app.getHttpServer());
  });
  // Truncating also resets the rate-limit counters, which live in the database.
  beforeEach(async () => {
    await resetDb(app);
    await createAdmin(app);
  });
  afterAll(() => app.close());

  const login = (body = ADMIN) => http.post('/api/auth/login').send(body);
  const refreshCookie = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refresh_token='))!;
  const refresh = (cookie: string) => http.post('/api/auth/refresh').set('Cookie', cookie.split(';')[0]);

  it('rejects wrong password and unknown email with the same generic error', async () => {
    const wrongPassword = await login({ ...ADMIN, password: 'nope-nope-nope' }).expect(401);
    const unknownEmail = await login({ ...ADMIN, email: 'ghost@test.dev' }).expect(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('requires a valid bearer token on admin routes', async () => {
    await http.get('/api/admin/services').expect(401);
    await http.get('/api/admin/services').set('X-Authorization', 'Bearer not-a-jwt').expect(401);

    const { body } = await login().expect(200);
    await http.get('/api/admin/services').set('X-Authorization', `Bearer ${body.accessToken}`).expect(200);
  });

  it('reads the token from X-Authorization only (in production CloudFront owns Authorization)', async () => {
    const { body } = await login().expect(200);
    await http.get('/api/admin/services').set('Authorization', `Bearer ${body.accessToken}`).expect(401);
  });

  it('does not accept a refresh token as an access token', async () => {
    const cookie = refreshCookie(await login().expect(200));
    const refreshToken = cookie.split(';')[0].split('=')[1];
    await http.get('/api/admin/services').set('X-Authorization', `Bearer ${refreshToken}`).expect(401);
  });

  it('sets the refresh token in a hardened cookie and rotates it on refresh', async () => {
    const cookie = refreshCookie(await login().expect(200));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/auth\/refresh/);

    const res = await refresh(cookie).expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookie(res).split(';')[0]).not.toBe(cookie.split(';')[0]);
  });

  it('logout invalidates every refresh token', async () => {
    const res = await login().expect(200);
    await http.post('/api/auth/logout').set('X-Authorization', `Bearer ${res.body.accessToken}`).expect(204);
    await refresh(refreshCookie(res)).expect(401);
  });

  it('password change requires the current password and ends sessions', async () => {
    const res = await login().expect(200);
    const auth = `Bearer ${res.body.accessToken}`;
    const newPassword = 'another-long-password';

    await http
      .patch('/api/admin/account/password')
      .set('X-Authorization', auth)
      .send({ currentPassword: 'wrong-password', newPassword })
      .expect(403);
    await http
      .patch('/api/admin/account/password')
      .set('X-Authorization', auth)
      .send({ currentPassword: ADMIN.password, newPassword: '1234' })
      .expect(400);
    await http
      .patch('/api/admin/account/password')
      .set('X-Authorization', auth)
      .send({ currentPassword: ADMIN.password, newPassword })
      .expect(204);

    await refresh(refreshCookie(res)).expect(401);
    await login().expect(401);
    await login({ ...ADMIN, password: newPassword }).expect(200);
  });

  it('rate-limits login attempts across app instances (counters are shared, not in memory)', async () => {
    const other = await createApp();
    try {
      for (let i = 0; i < 5; i++) await login({ ...ADMIN, password: 'wrong-password' }).expect(401);
      await request(other.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(429);
    } finally {
      await other.close();
    }
  });

  it('keys the rate limit on the IP set by the trusted edge, ignoring client-forged X-Forwarded-For', async () => {
    const behindEdge = await createApp({ CLIENT_IP_HEADER: 'x-viewer-ip' });
    try {
      const attempt = (viewerIp: string, forwardedFor: string) =>
        request(behindEdge.getHttpServer())
          .post('/api/auth/login')
          .set('X-Viewer-Ip', viewerIp)
          .set('X-Forwarded-For', forwardedFor)
          .send({ ...ADMIN, password: 'wrong-password' });

      for (let i = 0; i < 5; i++) await attempt('203.0.113.7', `10.0.0.${i}`).expect(401);
      await attempt('203.0.113.7', '10.0.0.99').expect(429);
      await attempt('203.0.113.8', '10.0.0.99').expect(401);
    } finally {
      await behindEdge.close();
    }
  });
});
