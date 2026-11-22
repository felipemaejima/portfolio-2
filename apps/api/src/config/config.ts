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
    REFRESH_COOKIE_PATH: z.string().startsWith('/').default('/api/auth/refresh'),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
    /**
     * Header carrying the real client IP, set by a trusted edge (CloudFront Function) that overwrites any client value.
     * Unset: the socket address (local dev). Never point it at X-Forwarded-For, whose entries clients can forge.
     */
    CLIENT_IP_HEADER: z.string().toLowerCase().optional(),
    PASSWORD_MIN_LENGTH: z.coerce.number().int().min(1).default(5),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    UPLOADS_DIR: z.string().min(1).default('/data/uploads'),
    S3_BUCKET: z.string().min(1).optional(),
    /** Base of public upload URLs; defaults to the API serving them itself (local driver). */
    UPLOADS_PUBLIC_URL: z.url().optional(),
    /** Discord webhooks: secrets, read from SSM at boot in production (ssm-secrets.ts). Unset outside production:
     * messages are only logged. #contato: Mensagens de contato; #alertas: Logins; #visitas: Visitas. */
    DISCORD_CONTACT_WEBHOOK_URL: z.url().optional(),
    DISCORD_ALERTS_WEBHOOK_URL: z.url().optional(),
    DISCORD_VISITS_WEBHOOK_URL: z.url().optional(),
    /** Login com Google (ADR 0002). Required in production (the client ID from Terraform, the secrets from SSM); outside
     * it, without all three, the Google button leads to the generic error. Dev uses its own OAuth client, never production's. */
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    /** Key of the cookie that holds a Login pelo Google in progress (AES-256-GCM): a secret of its own. */
    OAUTH_STATE_SECRET: z.string().min(32).optional(),
  })
  .refine((c) => c.JWT_ACCESS_SECRET !== c.JWT_REFRESH_SECRET, {
    message: 'must differ from JWT_ACCESS_SECRET',
    path: ['JWT_REFRESH_SECRET'],
  })
  .refine((c) => !c.OAUTH_STATE_SECRET || ![c.JWT_ACCESS_SECRET, c.JWT_REFRESH_SECRET].includes(c.OAUTH_STATE_SECRET), {
    message: 'must differ from the JWT secrets',
    path: ['OAUTH_STATE_SECRET'],
  })
  .refine((c) => c.STORAGE_DRIVER !== 's3' || (c.S3_BUCKET && c.UPLOADS_PUBLIC_URL), {
    message: 'S3_BUCKET and UPLOADS_PUBLIC_URL are required with STORAGE_DRIVER=s3',
    path: ['STORAGE_DRIVER'],
  })
  .superRefine((c, ctx) => {
    if (c.NODE_ENV !== 'production') return;
    const required = [
      'DISCORD_CONTACT_WEBHOOK_URL',
      'DISCORD_ALERTS_WEBHOOK_URL',
      'DISCORD_VISITS_WEBHOOK_URL',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'OAUTH_STATE_SECRET',
    ] as const;
    for (const key of required) {
      if (!c[key]) ctx.addIssue({ code: 'custom', message: 'required in production', path: [key] });
    }
  })
  .transform((c) => ({ ...c, UPLOADS_PUBLIC_URL: c.UPLOADS_PUBLIC_URL ?? `${c.PUBLIC_URL}/uploads` }));

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
