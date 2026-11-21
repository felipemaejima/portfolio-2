import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, loadConfig, type Config } from '../src/config/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

export const ADMIN = { email: 'admin@test.dev', password: 'correct-horse-battery' };

export async function createApp(overrides: Partial<Config> = {}) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIG)
    .useValue({ ...loadConfig(), ...overrides })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  return app;
}

export async function resetDb(app: NestExpressApplication) {
  await app
    .get(PrismaService)
    .$executeRawUnsafe(
      'TRUNCATE "Admin", "Profile", "SocialLink", "SkillCategory", "Skill", "Project", "Experience", "Education", "Service", "Media", "ContactMessage", "RateLimit" CASCADE',
    );
}

export async function createAdmin(app: NestExpressApplication) {
  await app.get(PrismaService).admin.create({ data: { email: ADMIN.email, passwordHash: await argon2.hash(ADMIN.password) } });
}

/** Fresh admin + access token. */
export async function adminToken(app: NestExpressApplication) {
  await createAdmin(app);
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);
  return res.body.accessToken as string;
}

export const lt = (pt: string, en?: string) => ({ pt, ...(en && { en }) });

/** Stands in for a Discord webhook: records every JSON body it gets and answers `status`, or never answers ('hang'). */
export async function fakeWebhook() {
  const received: unknown[] = [];
  let reply: number | 'hang' = 204;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push(JSON.parse(body));
      if (reply !== 'hang') res.writeHead(reply).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhook`,
    received,
    replyWith: (status: number | 'hang') => (reply = status),
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
