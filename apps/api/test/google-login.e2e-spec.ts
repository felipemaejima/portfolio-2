import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { ADMIN, createAdmin, createApp, fakeGoogle, fakeWebhook, resetDb } from './helpers';

const GOOGLE_CONFIG = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  OAUTH_STATE_SECRET: 'oauth-state-secret-0123456789abcdef',
};
const setCookies = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []);
const cookieNamed = (res: request.Response, name: string) => setCookies(res).find((c) => c.startsWith(`${name}=`));

describe('Login pelo Google', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let discord: Awaited<ReturnType<typeof fakeWebhook>>;
  const google = fakeGoogle();

  beforeAll(async () => {
    discord = await fakeWebhook();
    app = await createApp({ ...GOOGLE_CONFIG, DISCORD_ALERTS_WEBHOOK_URL: discord.url }, { google });
    http = request(app.getHttpServer());
  });
  afterAll(async () => {
    await app.close();
    await discord.close();
  });
  beforeEach(async () => {
    await resetDb(app);
    await createAdmin(app);
    discord.received.length = 0;
    google.account = { subject: 'google-sub-1', email: 'admin@gmail.test' };
  });

  /** The admin's Conta vinculada, made straight in the database: linking from the panel comes in #90. */
  const linkGoogleAccount = async (email = 'admin@gmail.test') => {
    const prisma = app.get(PrismaService);
    const admin = await prisma.admin.findFirstOrThrow();
    await prisma.linkedAccount.create({ data: { adminId: admin.id, provider: 'GOOGLE', subject: 'google-sub-1', email } });
  };
  /** Starts a Login pelo Google, as the browser does: the pending-flow cookie and the state Google echoes back. */
  const start = async () => {
    const res = await http.get('/api/auth/google').expect(302);
    const state = new URL(res.headers.location as string).searchParams.get('state')!;
    return { cookie: cookieNamed(res, 'google_oauth')!.split(';')[0], state };
  };
  const callback = (query: string, cookie?: string) => {
    const req = http.get(`/api/auth/google/callback?${query}`);
    return cookie ? req.set('Cookie', cookie) : req;
  };
  /** Whatever the outcome, the callback deletes the pending-flow cookie: it serves once. */
  const expectCookieDeleted = (res: request.Response) =>
    expect(cookieNamed(res, 'google_oauth')).toMatch(/^google_oauth=;.*Expires=Thu, 01 Jan 1970/);
  /** Back to the login screen with `failure`: no session, no Login announced. */
  const expectRefused = (res: request.Response, failure: string) => {
    expect(res.headers.location).toBe(`/admin?google=${failure}`);
    expect(cookieNamed(res, 'refresh_token')).toBeUndefined();
    expect(discord.received).toEqual([]);
    expectCookieDeleted(res);
  };
  /** One byte of the sealed value changed. */
  const tamper = (cookie: string) => {
    const [name, value] = cookie.split('=');
    const i = Math.floor(value.length / 2);
    return `${name}=${value.slice(0, i)}${value[i] === 'A' ? 'B' : 'A'}${value.slice(i + 1)}`;
  };

  it('starts by sending the browser to Google, with a short-lived cookie that only the callback receives', async () => {
    const res = await http.get('/api/auth/google').expect(302);

    expect(res.headers.location).toMatch(/^https:\/\/google\.test\/auth\?state=[\w-]{43}$/);
    const cookie = cookieNamed(res, 'google_oauth');
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/); // Strict would not come back with Google's cross-site redirect
    expect(cookie).toMatch(/Path=\/api\/auth\/google\/callback/);
    expect(cookie).toMatch(/Max-Age=600/);
  });

  it('logs a linked admin in: back on /admin with a working session, the displayed email refreshed, the Login announced', async () => {
    await linkGoogleAccount('old-address@gmail.test');
    const { cookie, state } = await start();

    const res = await callback(`state=${state}&code=the-code&scope=openid+email`, cookie).expect(302);

    expect(res.headers.location).toBe('/admin');
    expectCookieDeleted(res);
    const refreshCookie = cookieNamed(res, 'refresh_token')!;
    expect(refreshCookie).toMatch(/SameSite=Strict/);
    await http.post('/api/auth/refresh').set('Cookie', refreshCookie.split(';')[0]).expect(200);
    expect(discord.received).toEqual([
      expect.objectContaining({
        embeds: [expect.objectContaining({ fields: expect.arrayContaining([expect.objectContaining({ name: 'Método', value: 'Google (admin@gmail.test)' })]) })],
      }),
    ]);
    // Straight from the database until #90's GET /admin/account/google shows the displayed email.
    expect((await app.get(PrismaService).linkedAccount.findFirstOrThrow()).email).toBe('admin@gmail.test');
  });

  it('refuses a Google account that is not a Conta vinculada: nao-vinculada', async () => {
    const { cookie, state } = await start();
    expectRefused(await callback(`state=${state}&code=the-code`, cookie).expect(302), 'nao-vinculada');
  });

  it('takes a cancel on Google back to the login screen quietly, and any other Google error as erro', async () => {
    let { cookie, state } = await start();
    expectRefused(await callback(`error=access_denied&state=${state}`, cookie).expect(302), 'cancelado');
    ({ cookie, state } = await start());
    expectRefused(await callback(`error=server_error&state=${state}`, cookie).expect(302), 'erro');
  });

  it('refuses a missing cookie, a state other than the cookie\'s and a failed exchange with Google', async () => {
    await linkGoogleAccount();
    const { cookie, state } = await start();
    expectRefused(await callback(`state=${state}&code=the-code`).expect(302), 'erro');
    expectRefused(await callback(`state=not-${state}&code=the-code`, cookie).expect(302), 'erro');

    const next = await start();
    google.account = new Error('invalid_grant');
    expectRefused(await callback(`state=${next.state}&code=the-code`, next.cookie).expect(302), 'erro');
  });

  it('refuses a cookie with one byte changed, one sealed with another key, an expired one and one used before', async () => {
    await linkGoogleAccount();
    let { cookie, state } = await start();
    expectRefused(await callback(`state=${state}&code=the-code`, tamper(cookie)).expect(302), 'erro');

    const otherKey = await createApp({ ...GOOGLE_CONFIG, OAUTH_STATE_SECRET: 'another-state-secret-0123456789abcdef' }, { google });
    try {
      const res = await request(otherKey.getHttpServer()).get('/api/auth/google').expect(302);
      const sealedElsewhere = cookieNamed(res, 'google_oauth')!.split(';')[0];
      const echoed = new URL(res.headers.location as string).searchParams.get('state');
      expectRefused(await callback(`state=${echoed}&code=the-code`, sealedElsewhere).expect(302), 'erro');
    } finally {
      await otherKey.close();
    }

    ({ cookie, state } = await start());
    const later = Date.now() + 10 * 60 * 1000 + 1;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    try {
      expectRefused(await callback(`state=${state}&code=the-code`, cookie).expect(302), 'erro');
    } finally {
      jest.restoreAllMocks();
    }

    ({ cookie, state } = await start());
    await callback(`state=${state}&code=the-code`, cookie).expect(302, /\/admin$/);
    discord.received.length = 0;
    expectRefused(await callback(`state=${state}&code=the-code`, cookie).expect(302), 'erro'); // replayed copy
  });

  it('logs what a caller can cause as warn, never as error, and never logs the query (it carries the code)', async () => {
    const logs = (['log', 'warn', 'error'] as const).map((level) => jest.spyOn(Logger.prototype, level));
    try {
      const { cookie, state } = await start();
      await callback(`state=${state}&code=secret-code-123`).expect(302); // no cookie
      await callback(`state=wrong&code=secret-code-123`, cookie).expect(302);
      const next = await start();
      await callback(`state=${next.state}&code=secret-code-123`, next.cookie).expect(302); // not linked

      const [, warn, error] = logs;
      expect(warn).toHaveBeenCalledTimes(3);
      expect(error).not.toHaveBeenCalled();
      expect(JSON.stringify(logs.map((spy) => spy.mock.calls))).not.toContain('secret-code-123');
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('ends a session opened by Google like any other: on logout and on a password change', async () => {
    await linkGoogleAccount();
    const loginWithGoogle = async () => {
      const { cookie, state } = await start();
      const res = await callback(`state=${state}&code=the-code`, cookie).expect(302);
      const refreshCookie = cookieNamed(res, 'refresh_token')!.split(';')[0];
      const { body } = await http.post('/api/auth/refresh').set('Cookie', refreshCookie).expect(200);
      return { refreshCookie, auth: `Bearer ${body.accessToken as string}` };
    };

    let session = await loginWithGoogle();
    await http.post('/api/auth/logout').set('X-Authorization', session.auth).expect(204);
    await http.post('/api/auth/refresh').set('Cookie', session.refreshCookie).expect(401);

    session = await loginWithGoogle();
    await http
      .patch('/api/admin/account/password')
      .set('X-Authorization', session.auth)
      .send({ currentPassword: ADMIN.password, newPassword: 'another-long-password' })
      .expect(204);
    await http.post('/api/auth/refresh').set('Cookie', session.refreshCookie).expect(401);
  });

  it('allows 5 starts and 5 callbacks per minute per IP', async () => {
    for (let i = 0; i < 5; i++) await http.get('/api/auth/google').expect(302);
    await http.get('/api/auth/google').expect(429);
    for (let i = 0; i < 5; i++) await callback('state=x&code=y').expect(302);
    await callback('state=x&code=y').expect(429);
  });

  it('sends the button to the generic error when Google is not configured', async () => {
    const unconfigured = await createApp(
      { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, OAUTH_STATE_SECRET: undefined },
      { google },
    );
    try {
      const res = await request(unconfigured.getHttpServer()).get('/api/auth/google').expect(302);
      expect(res.headers.location).toBe('/admin?google=erro');
      expect(cookieNamed(res, 'google_oauth')).toBeUndefined();
    } finally {
      await unconfigured.close();
    }
  });
});
