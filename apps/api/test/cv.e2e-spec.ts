import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { adminToken, createApp, lt, resetDb } from './helpers';

describe('cv', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let auth: string;

  beforeAll(async () => {
    app = await createApp();
    http = request(app.getHttpServer());
    await resetDb(app);
    auth = `Bearer ${await adminToken(app)}`;
  });
  afterAll(() => app.close());

  it('generates a PDF and revalidates with ETag until content changes', async () => {
    const created = await http
      .post('/admin/services')
      .set('Authorization', auth)
      .send({ title: lt('Consultoria'), description: lt('x') })
      .expect(201);

    const first = await http.get('/cv?lang=pt').buffer(true).expect(200);
    expect(first.headers['content-type']).toBe('application/pdf');
    expect(first.body.subarray(0, 5).toString()).toBe('%PDF-');
    const etag = first.headers.etag;

    await http.get('/cv?lang=pt').set('If-None-Match', etag).expect(304);
    expect((await http.get('/cv?lang=en').expect(200)).headers.etag).not.toBe(etag);

    await http.patch(`/admin/services/${created.body.id}`).set('Authorization', auth).send({ title: lt('Mentoria') }).expect(200);
    const afterUpdate = (await http.get('/cv?lang=pt').set('If-None-Match', etag).expect(200)).headers.etag;

    await http.delete(`/admin/services/${created.body.id}`).set('Authorization', auth).expect(204);
    await http.get('/cv?lang=pt').set('If-None-Match', afterUpdate).expect(200);
  });
});
