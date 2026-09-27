import { Global, Module } from '@nestjs/common';
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    PUBLIC_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
    REFRESH_COOKIE_PATH: z.string().startsWith('/').default('/auth/refresh'),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    PASSWORD_MIN_LENGTH: z.coerce.number().int().min(1).default(5),
    STORAGE_DRIVER: z.enum(['local']).default('local'),
    UPLOADS_DIR: z.string().min(1),
  })
  .refine((c) => c.JWT_ACCESS_SECRET !== c.JWT_REFRESH_SECRET, {
    message: 'must differ from JWT_ACCESS_SECRET',
    path: ['JWT_REFRESH_SECRET'],
  });

export type Config = z.infer<typeof schema>;
export const CONFIG = Symbol('CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  return result.data;
}

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: () => loadConfig() }],
  exports: [CONFIG],
})
export class ConfigModule {}
