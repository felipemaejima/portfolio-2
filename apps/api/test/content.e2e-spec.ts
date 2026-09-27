import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { adminToken, createApp, lt, resetDb } from './helpers';

describe('content (validation, i18n, visibility, ordering)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let auth: string;

  beforeAll(async () => {
    app = await createApp();
    http = request(app.getHttpServer());
  });
  beforeEach(async () => {
    await resetDb(app);
    auth = `Bearer ${await adminToken(app)}`;
  });
  afterAll(() => app.close());

  const createService = (body: object) => http.post('/admin/services').set('Authorization', auth).send(body);

  it('rejects unknown fields and translatable text without Portuguese', async () => {
    await createService({ title: lt('A'), description: lt('B'), isAdmin: true }).expect(400);
    await createService({ title: { en: 'Only English' }, description: lt('B') }).expect(400);
    await createService({ title: { pt: 'A', fr: 'Oui' }, description: lt('B') }).expect(400);
    await createService({ title: lt('A'), description: lt('B') }).expect(201);
  });

  it('resolves the requested language and falls back to Portuguese', async () => {
    await createService({ title: lt('Consultoria', 'Consulting'), description: lt('Só em português') }).expect(201);

    const en = await http.get('/portfolio?lang=en').expect(200);
    expect(en.body.services).toEqual([expect.objectContaining({ title: 'Consulting', description: 'Só em português' })]);
    const pt = await http.get('/portfolio').expect(200);
    expect(pt.body.services[0].title).toBe('Consultoria');
    await http.get('/portfolio?lang=fr').expect(400);
  });

  it('never exposes hidden items or undisclosed contact data publicly', async () => {
    await createService({ title: lt('Hidden'), description: lt('x'), visible: false }).expect(201);
    await createService({ title: lt('Shown'), description: lt('x') }).expect(201);
    await http
      .post('/admin/projects')
      .set('Authorization', auth)
      .send({ title: lt('Secret project'), description: lt('x'), tags: [], featured: true, visible: false })
      .expect(201);
    await http
      .put('/admin/profile')
      .set('Authorization', auth)
      .send({
        name: 'Ana',
        headline: lt('Dev'),
        summary: lt('Resumo'),
        about: [],
        location: lt('SP'),
        availability: lt('CLT'),
        workModality: lt('Remoto'),
        spokenLanguages: lt('Português'),
        email: 'ana@test.dev',
        phone: '+55 11 90000-0000',
        showEmail: true,
        showPhone: false,
      })
      .expect(200);

    const { body } = await http.get('/portfolio').expect(200);
    expect(body.services.map((s: { title: string }) => s.title)).toEqual(['Shown']);
    expect(body.projects).toEqual([]);
    expect(body.profile).toMatchObject({ email: 'ana@test.dev', phone: null });
    expect((await http.get('/projects').expect(200)).body.total).toBe(0);

    const hidden = await http.get('/admin/services?visible=false').set('Authorization', auth).expect(200);
    expect(hidden.body.map((s: { title: { pt: string } }) => s.title.pt)).toEqual(['Hidden']);
  });

  it('reorders atomically', async () => {
    const ids: string[] = [];
    for (const name of ['a', 'b', 'c']) ids.push((await createService({ title: lt(name), description: lt(name) })).body.id);
    const titles = async () =>
      (await http.get('/admin/services').set('Authorization', auth)).body.map((s: { title: { pt: string } }) => s.title.pt);

    expect(await titles()).toEqual(['a', 'b', 'c']);
    await http.patch('/admin/services/reorder').set('Authorization', auth).send({ ids: [ids[2], ids[0], ids[1]] }).expect(204);
    expect(await titles()).toEqual(['c', 'a', 'b']);

    const unknown = '00000000-0000-4000-8000-000000000000';
    await http.patch('/admin/services/reorder').set('Authorization', auth).send({ ids: [ids[0], unknown, ids[1]] }).expect(404);
    expect(await titles()).toEqual(['c', 'a', 'b']);
  });
});
