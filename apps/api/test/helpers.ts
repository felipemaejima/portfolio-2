import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GoogleProvider, type GoogleChecks, type GoogleAccount } from '../src/auth/google.provider';
import { CONFIG, loadConfig, type Config } from '../src/config/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

export const ADMIN = { email: 'admin@test.dev', password: 'correct-horse-battery' };

/** The real app; `google` replaces the Google provider (never an env flag: that would be a back door in production). */
export async function createApp(overrides: Partial<Config> = {}, { google }: { google?: ReturnType<typeof fakeGoogle> } = {}) {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIG)
    .useValue({ ...loadConfig(), ...overrides });
  if (google) builder = builder.overrideProvider(GoogleProvider).useValue(google);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  return app;
}

export async function resetDb(app: NestExpressApplication) {
  await app
    .get(PrismaService)
    .$executeRawUnsafe(
      'TRUNCATE "Admin", "Profile", "SocialLink", "SkillCategory", "Skill", "Project", "Experience", "Education", "Service", "Media", "ContactMessage", "RateLimit", "LinkedAccount" CASCADE',
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

/**
 * Stands in for Google: the authorization URL echoes the state, and the exchange answers `account` (or throws it) only
 * when handed back the very state, nonce and code_verifier the URL was built with (they travel in the cookie).
 */
export function fakeGoogle() {
  let started: GoogleChecks | undefined;
  const google = {
    account: { subject: 'google-sub-1', email: 'admin@gmail.test' } as GoogleAccount | Error,
    authorizationUrl: async (checks: GoogleChecks) => {
      started = checks;
      return `https://google.test/auth?state=${checks.state}`;
    },
    exchange: async (_callback: URLSearchParams, checks: GoogleChecks) => {
      if (JSON.stringify(checks) !== JSON.stringify(started)) throw new Error('not the checks of the started flow');
      if (google.account instanceof Error) throw google.account;
      return google.account;
    },
  };
  return google;
}
