import type { NestExpressApplication } from '@nestjs/platform-express';
import { inflateSync } from 'node:zlib';
import request from 'supertest';
import { adminToken, createApp, lt, resetDb } from './helpers';

/** Text in drawing order: pdfmake draws standard-font text as WinAnsi hex strings inside compressed content streams. */
const pdfText = (pdf: Buffer) =>
  [...pdf.toString('latin1').matchAll(/stream\n([\s\S]*?)\nendstream/g)]
    .map(([, data]) => inflateSync(Buffer.from(data, 'latin1')).toString('latin1'))
    .join('')
    .match(/<[0-9a-f]*>/gi)!
    .map((hex) => Buffer.from(hex.slice(1, -1), 'hex').toString('latin1'))
    .join('');

describe('cv', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let auth: string;

  beforeAll(async () => {
    app = await createApp();
    http = request(app.getHttpServer());
    await resetDb(app);
    auth = `Bearer ${await adminToken(app)}`;
    // With a profile there is text, so the PDF fonts actually load.
    await http
      .put('/api/admin/profile')
      .set('X-Authorization', auth)
      .send({
        name: 'Ana Souza',
        headline: lt('Desenvolvedora', 'Developer'),
        summary: lt('Resumo com acentuação', 'Builds web apps'),
        about: [],
        location: lt('São Paulo'),
        availability: lt('CLT'),
        workModality: lt('Remoto'),
        spokenLanguages: lt('Português, inglês', 'Portuguese, English'),
        email: 'ana@test.dev',
        showEmail: true,
        showPhone: false,
      })
      .expect(200);
  });
  afterAll(() => app.close());

  it('generates a PDF and revalidates with ETag until content changes', async () => {
    const created = await http
      .post('/api/admin/services')
      .set('X-Authorization', auth)
      .send({ title: lt('Consultoria'), description: lt('x') })
      .expect(201);

    const first = await http.get('/api/cv?lang=pt').buffer(true).expect(200);
    expect(first.headers['content-type']).toBe('application/pdf');
    expect(first.body.subarray(0, 5).toString()).toBe('%PDF-');
    const etag = first.headers.etag;

    await http.get('/api/cv?lang=pt').set('If-None-Match', etag).expect(304);
    const en = await http.get('/api/cv?lang=en').buffer(true).expect(200);
    expect(en.headers['content-type']).toBe('application/pdf');
    expect(en.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(en.headers.etag).not.toBe(etag);

    await http.patch(`/api/admin/services/${created.body.id}`).set('X-Authorization', auth).send({ title: lt('Mentoria') }).expect(200);
    const afterUpdate = (await http.get('/api/cv?lang=pt').set('If-None-Match', etag).expect(200)).headers.etag;

    await http.delete(`/api/admin/services/${created.body.id}`).set('X-Authorization', auth).expect(204);
    await http.get('/api/cv?lang=pt').set('If-None-Match', afterUpdate).expect(200);
  });

  it('links e-mail, social profiles and projects, with text in reading order', async () => {
    const post = (path: string, body: object) => http.post(`/api/admin/${path}`).set('X-Authorization', auth).send(body).expect(201);
    await post('social-links', { label: 'GitHub', url: 'https://github.com/ana' });
    await post('experiences', { role: lt('Dev'), company: 'ACME', bullets: [lt('Shipped payments')], startDate: '2023-01-01' });
    await post('education', { title: lt('Bacharelado', 'BSc'), institution: 'USP', kind: 'DEGREE', startDate: '2017-01-01', endDate: '2021-01-01' });
    const category = await post('skill-categories', { name: lt('Backend') });
    await post('skills', { name: 'NestJS', categoryId: category.body.id });
    await post('projects', {
      title: lt('Pagamentos', 'Payments'),
      description: lt('Checkout'),
      tags: ['React'],
      repoUrl: 'https://github.com/ana/pay',
      demoUrl: 'https://pay.example.com',
      featured: true,
    });

    const { body: pdf } = await http.get('/api/cv?lang=en').buffer(true).expect(200);
    const raw = pdf.toString('latin1');
    for (const uri of ['mailto:ana@test.dev', 'https://github.com/ana', 'https://github.com/ana/pay', 'https://pay.example.com']) {
      expect(raw).toContain(`/URI (${uri})`);
    }
    // Single column: pdftotext and ATS parsers read the text in the order it is drawn.
    expect(pdfText(pdf)).toMatch(
      /Ana Souza.*Developer.*ana@test\.dev.*github\.com\/ana.*Summary.*Builds web apps.*Experience.*Dev.*ACME.*Shipped payments.*Education.*BSc.*USP.*Skills.*Backend.*NestJS.*Projects.*Payments.*Checkout.*Languages.*Portuguese/is,
    );
  });

  it('never serves an error as publicly cacheable', async () => {
    const res = await http.get('/api/cv?lang=fr').expect(400);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
