import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ADMIN, createAdmin, createApp, fakeWebhook, resetDb } from './helpers';

describe('visits', () => {
  let app: NestExpressApplication;
  let discord: Awaited<ReturnType<typeof fakeWebhook>>;
  const firstLoad = { page: '/', lang: 'pt', referrer: 'https://www.google.com/search?q=portfolio' };
  const visit = (ip: string, body: object = firstLoad) =>
    request(app.getHttpServer())
      .post('/api/visits')
      .set('X-Viewer-Ip', ip)
      .set('User-Agent', `Firefox/${'x'.repeat(500)}`)
      .send(body);

  beforeAll(async () => {
    discord = await fakeWebhook();
    app = await createApp({ DISCORD_VISITS_WEBHOOK_URL: discord.url, CLIENT_IP_HEADER: 'x-viewer-ip' });
  });
  afterAll(async () => {
    await app.close();
    await discord.close();
  });
  beforeEach(async () => {
    await resetDb(app); // the per-IP limit and the site-wide cap count in the database
    discord.received.length = 0;
    discord.replyWith(204);
  });
  afterEach(() => jest.restoreAllMocks());

  it('posts the page, language, origin domain and browser (cut) to #visitas, never the IP', async () => {
    await visit('203.0.113.7').expect(204);

    expect(discord.received).toEqual([
      {
        allowed_mentions: { parse: [] },
        embeds: [
          expect.objectContaining({
            fields: [
              expect.objectContaining({ name: 'Página', value: '/' }),
              expect.objectContaining({ name: 'Idioma', value: 'pt' }),
              expect.objectContaining({ name: 'Origem', value: 'www.google.com' }),
              expect.objectContaining({ name: 'Navegador', value: `Firefox/${'x'.repeat(192)}…` }),
            ],
          }),
        ],
      },
    ]);
    expect(JSON.stringify(discord.received)).not.toContain('203.0.113.7');
  });

  it('shows "direto" when there is no origin or it is not a URL', async () => {
    await visit('203.0.113.1', { page: '/projetos', lang: 'en', referrer: '' }).expect(204);
    await visit('203.0.113.2', { page: '/', lang: 'pt', referrer: 'not a url' }).expect(204);
    await visit('203.0.113.3', { page: '/', lang: 'pt' }).expect(204);

    type Message = { embeds: { fields: { value: string }[] }[] };
    const origins = discord.received.map((m) => (m as Message).embeds[0].fields[2].value);
    expect(origins).toEqual(['direto', 'direto', 'direto']);
  });

  it('accepts only the fixed pages and languages', async () => {
    await visit('203.0.113.1', { ...firstLoad, page: '/admin' }).expect(400);
    await visit('203.0.113.2', { ...firstLoad, lang: 'fr' }).expect(400);
    expect(discord.received).toEqual([]);
  });

  it('announces an IP once per 24 h, whatever the browser or the page', async () => {
    await visit('203.0.113.7').expect(204);
    await visit('203.0.113.7', { page: '/projetos', lang: 'en' }).expect(429);
    expect(discord.received).toHaveLength(1);
  });

  it('stops at 50 Visitas a day site-wide; a repeated IP spends nothing; Login and contact go on', async () => {
    for (let i = 1; i <= 49; i++) await visit(`198.51.100.${i}`).expect(204);
    await visit('198.51.100.1').expect(429); // repeated IP: refused before the cap counts it
    await visit('198.51.100.50').expect(204);
    await visit('198.51.100.51').expect(204); // over the cap: success, nothing sent, no "cap reached" message
    expect(discord.received).toHaveLength(50);

    await createAdmin(app);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);
    const cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? [])[0].split(';')[0];
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    await request(app.getHttpServer())
      .post('/api/contact')
      .send({ name: 'Ana', email: 'ana@test.dev', message: 'Oi' })
      .expect(204);
  });

  it('answers 204 even when Discord fails, logging an error without the webhook URL', async () => {
    const errors = jest.spyOn(Logger.prototype, 'error');
    discord.replyWith(500);

    await visit('203.0.113.7').expect(204);

    expect(errors).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errors.mock.calls)).not.toContain(discord.url);
  });
});
