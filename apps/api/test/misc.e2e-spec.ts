import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp, fakeWebhook, resetDb } from './helpers';

describe('contact', () => {
  let app: NestExpressApplication;
  let discord: Awaited<ReturnType<typeof fakeWebhook>>;
  const send = (body: object) => request(app.getHttpServer()).post('/api/contact').send(body);
  const valid = { name: 'Ana', email: 'ana@test.dev', message: 'Oi @everyone, vi seu portfolio' };

  beforeAll(async () => {
    discord = await fakeWebhook();
    app = await createApp({ DISCORD_CONTACT_WEBHOOK_URL: discord.url });
  });
  afterAll(async () => {
    await app.close();
    await discord.close();
  });
  beforeEach(async () => {
    await resetDb(app); // the 3-per-minute limit counts in the database
    discord.received.length = 0;
    discord.replyWith(204);
  });

  it('delivers the message to #contato as plain text in an embed, with mentions disabled', async () => {
    await send(valid).expect(204);

    expect(discord.received).toEqual([
      {
        allowed_mentions: { parse: [] },
        embeds: [
          expect.objectContaining({
            description: 'Oi @everyone, vi seu portfolio',
            fields: [expect.objectContaining({ value: 'Ana' }), expect.objectContaining({ value: 'ana@test.dev' })],
          }),
        ],
      },
    ]);
  });

  it('answers an error, never a false success, when Discord fails or takes too long', async () => {
    discord.replyWith(500);
    await send(valid).expect(502);

    discord.replyWith('hang'); // gives up after ~2 s: the Lambda is billed while it waits
    await send(valid).expect(502);
  });

  it('answers success to a filled honeypot without sending anything', async () => {
    await send({ ...valid, honeypot: 'https://spam.example' }).expect(204);
    expect(discord.received).toEqual([]);
  });

  it('rejects an invalid e-mail and blank text', async () => {
    await send({ ...valid, email: 'not-an-email' }).expect(400);
    await send({ ...valid, name: '   ' }).expect(400); // Discord rejects blank embed fields
    await send({ ...valid, message: ' \n ' }).expect(400);
  });

  it('takes up to 4000 characters, counted as the form counts them', async () => {
    await send({ ...valid, message: 'a'.repeat(4001) }).expect(400);
    // 4002 UTF-16 units, as the textarea's maxLength counts them
    await send({ ...valid, message: '❤️'.repeat(2001) }).expect(400);
    await send({ ...valid, message: 'a'.repeat(4000) }).expect(204);
    expect(discord.received).toHaveLength(1);
  });
});

describe('health', () => {
  it('reports the app and database as up', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
    await app.close();
  });
});

describe('test error', () => {
  it('forces a 500 for anyone, to check the API error Alertas end to end (temporary)', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).get('/api/test-error').expect(500);
    await app.close();
  });
});

describe('swagger', () => {
  it('is served outside production', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    await app.close();
  });

  it('is not served in production', async () => {
    const app = await createApp({ NODE_ENV: 'production' });
    await request(app.getHttpServer()).get('/api/docs').expect(404);
    await request(app.getHttpServer()).get('/api/docs-json').expect(404);
    await app.close();
  });
});
