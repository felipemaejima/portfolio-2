import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
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
      'TRUNCATE "Admin", "Profile", "SocialLink", "SkillCategory", "Skill", "Project", "Experience", "Education", "Service", "Media", "ContactMessage" CASCADE',
    );
}

export async function createAdmin(app: NestExpressApplication) {
  await app.get(PrismaService).admin.create({ data: { email: ADMIN.email, passwordHash: await argon2.hash(ADMIN.password) } });
}

/** Fresh admin + access token. */
export async function adminToken(app: NestExpressApplication) {
  await createAdmin(app);
  const res = await request(app.getHttpServer()).post('/auth/login').send(ADMIN).expect(200);
  return res.body.accessToken as string;
}

export const lt = (pt: string, en?: string) => ({ pt, ...(en && { en }) });
