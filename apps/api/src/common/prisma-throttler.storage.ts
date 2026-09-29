import type { ThrottlerStorage } from '@nestjs/throttler';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Rate-limit counters in Postgres, so the limit holds across Lambda instances.
 * One statement: purge long-expired rows, then open a new window or count a hit in the current one.
 * ponytail: fixed window (a burst can straddle two windows); sliding window if abuse shows up.
 */
export class PrismaThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly prisma: PrismaService) {}

  async increment(key: string, ttl: number, limit: number) {
    const [{ hits, expiresAt }] = await this.prisma.$queryRaw<{ hits: number; expiresAt: Date }[]>`
      WITH purge AS (DELETE FROM "RateLimit" WHERE "expiresAt" < now() - interval '1 hour')
      INSERT INTO "RateLimit" (key, hits, "expiresAt")
      VALUES (${key}, 1, now() + ${ttl} * interval '1 millisecond')
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN "RateLimit"."expiresAt" <= now() THEN 1 ELSE "RateLimit".hits + 1 END,
        "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= now() THEN EXCLUDED."expiresAt" ELSE "RateLimit"."expiresAt" END
      RETURNING hits, "expiresAt"`;
    const timeToExpire = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    return { totalHits: hits, timeToExpire, isBlocked: hits > limit, timeToBlockExpire: timeToExpire };
  }
}
