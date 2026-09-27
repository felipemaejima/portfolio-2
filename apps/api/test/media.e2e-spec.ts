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

  const upload = (data: Buffer, filename: string, contentType: string) =>
    http.post('/admin/uploads').set('Authorization', auth).attach('file', data, { filename, contentType });

  it('stores images detected by content and serves them', async () => {
    const { body } = await upload(PNG, 'photo.png', 'image/png').expect(201);
    expect(body).toMatchObject({ mime: 'image/png', size: PNG.length });

    const path = new URL(body.url).pathname;
    const file = await http.get(path).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects files whose content is not an allowed image, whatever their name or declared type', async () => {
    await upload(Buffer.from('<script>alert(1)</script>'), 'evil.png', 'image/png').expect(400);
  });

  it('rejects files over the size limit', async () => {
    await upload(Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), 'big.png', 'image/png').expect(413);
  });

  it('refuses to delete referenced media and lists orphans', async () => {
    const used = (await upload(PNG, 'a.png', 'image/png').expect(201)).body;
    const orphan = (await upload(PNG, 'b.png', 'image/png').expect(201)).body;
    await http
      .post('/admin/projects')
      .set('Authorization', auth)
      .send({ title: lt('P'), description: lt('D'), tags: [], imageMediaId: used.id })
      .expect(201);

    await http.delete(`/admin/media/${used.id}`).set('Authorization', auth).expect(409);

    const unused = await http.get('/admin/media?unused=true&pageSize=50').set('Authorization', auth).expect(200);
    const unusedIds = unused.body.items.map((m: { id: string }) => m.id);
    expect(unusedIds).toContain(orphan.id);
    expect(unusedIds).not.toContain(used.id);

    await http.delete(`/admin/media/${orphan.id}`).set('Authorization', auth).expect(204);
    await http.get(new URL(orphan.url).pathname).expect(404);
  });
});
