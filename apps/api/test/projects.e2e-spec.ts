import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { adminToken, createApp, lt, resetDb } from './helpers';

describe('project listing filters', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;
  let auth: string;

  beforeAll(async () => {
    app = await createApp();
    http = request(app.getHttpServer());
    await resetDb(app);
    auth = `Bearer ${await adminToken(app)}`;
    const projects = [
      { title: lt('Integração de pagamentos'), description: lt('Checkout'), tags: ['React', 'Node.js'], featured: true },
      { title: lt('Painel', 'Analytics dashboard'), description: lt('Métricas'), tags: ['react', 'PostgreSQL'] },
      { title: lt('CLI interna'), description: lt('Ferramenta'), tags: ['Go'], visible: false },
    ];
    for (const project of projects) {
      await http.post('/api/admin/projects').set('X-Authorization', auth).send(project).expect(201);
    }
  });
  afterAll(() => app.close());

  const titles = async (query: string) => {
    const { body } = await http.get(`/api/projects?${query}`).expect(200);
    return body.items.map((p: { title: string }) => p.title);
  };

  it('matches tags case-insensitively, any by default or all on request', async () => {
    expect(await titles('tags=REACT')).toEqual(['Integração de pagamentos', 'Painel']);
    expect(await titles('tags=go,postgresql')).toEqual(['Painel']);
    expect(await titles('tags=react,postgresql&tagsMode=all')).toEqual(['Painel']);
  });

  it('filters featured projects', async () => {
    expect(await titles('featured=true')).toEqual(['Integração de pagamentos']);
    expect(await titles('featured=false')).toEqual(['Painel']);
  });

  it('searches text ignoring accents, in the requested language, with LIKE wildcards escaped', async () => {
    expect(await titles('q=integracao')).toEqual(['Integração de pagamentos']);
    expect(await titles('q=METRICAS')).toEqual(['Painel']);
    expect(await titles('q=analytics&lang=en')).toEqual(['Analytics dashboard']);
    expect(await titles('q=analytics')).toEqual([]);
    expect(await titles('q=%25')).toEqual([]);
  });

  it('sorts and paginates', async () => {
    expect(await titles('sort=-createdAt')).toEqual(['Painel', 'Integração de pagamentos']);
    const { body } = await http.get('/api/projects?pageSize=1&page=2').expect(200);
    expect(body).toMatchObject({ total: 2, page: 2, pageSize: 1, items: [{ title: 'Painel' }] });
    await http.get('/api/projects?pageSize=51').expect(400);
  });

  it('lets the admin see and filter hidden projects', async () => {
    const { body } = await http.get('/api/admin/projects?visible=false').set('X-Authorization', auth).expect(200);
    expect(body.items.map((p: { title: { pt: string } }) => p.title.pt)).toEqual(['CLI interna']);
  });
});
