import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { adminToken, createApp, lt, resetDb } from './helpers';

// Real PNG signature; content after it is irrelevant for type detection.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

describe('media', () => {
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

  // The body is the file itself; the declared Content-Type only selects the raw parser, never the stored type.
  const upload = (data: Buffer, contentType = 'image/png') =>
    http.post('/api/admin/uploads').set('X-Authorization', auth).set('Content-Type', contentType).send(data);

  it('stores images detected by content and serves them', async () => {
    const { body } = await upload(PNG).expect(201);
    expect(body).toMatchObject({ mime: 'image/png', size: PNG.length });

    const path = new URL(body.url).pathname;
    const file = await http.get(path).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects files whose content is not an allowed image, whatever their declared type', async () => {
    await upload(Buffer.from('<script>alert(1)</script>'), 'image/png').expect(400);
    await http.post('/api/admin/uploads').set('X-Authorization', auth).send({ file: 'x' }).expect(400);
  });

  it('rejects files over the size limit as a client error, without logging a server error', async () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error');
    try {
      const { body } = await upload(Buffer.concat([PNG, Buffer.alloc(4 * 1024 * 1024)])).expect(413);
      expect(body).toMatchObject({ statusCode: 413 });
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('refuses to delete referenced media and lists orphans', async () => {
    const used = (await upload(PNG).expect(201)).body;
    const orphan = (await upload(PNG).expect(201)).body;
    await http
      .post('/api/admin/projects')
      .set('X-Authorization', auth)
      .send({ title: lt('P'), description: lt('D'), tags: [], imageMediaId: used.id })
      .expect(201);

    await http.delete(`/api/admin/media/${used.id}`).set('X-Authorization', auth).expect(409);

    const unused = await http.get('/api/admin/media?unused=true&pageSize=50').set('X-Authorization', auth).expect(200);
    const unusedIds = unused.body.items.map((m: { id: string }) => m.id);
    expect(unusedIds).toContain(orphan.id);
    expect(unusedIds).not.toContain(used.id);

    await http.delete(`/api/admin/media/${orphan.id}`).set('X-Authorization', auth).expect(204);
    await http.get(new URL(orphan.url).pathname).expect(404);
  });
});
