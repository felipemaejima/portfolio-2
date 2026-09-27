import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp } from './helpers';

describe('contact', () => {
  let app: NestExpressApplication;
  beforeAll(async () => (app = await createApp()));
  afterAll(() => app.close());

  it('validates the message, then reports the channel as not implemented', async () => {
    const http = request(app.getHttpServer());
    await http.post('/contact').send({ name: 'Ana', email: 'not-an-email', message: 'Oi' }).expect(400);
    await http.post('/contact').send({ name: 'Ana', email: 'ana@test.dev', message: 'Oi' }).expect(501);
  });
});

describe('swagger', () => {
  it('is served outside production', async () => {
    const app = await createApp();
    await request(app.getHttpServer()).get('/docs-json').expect(200);
    await app.close();
  });

  it('is not served in production', async () => {
    const app = await createApp({ NODE_ENV: 'production' });
    await request(app.getHttpServer()).get('/docs').expect(404);
    await request(app.getHttpServer()).get('/docs-json').expect(404);
    await app.close();
  });
});
