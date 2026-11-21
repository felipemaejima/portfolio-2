import { Controller, Get, Module } from '@nestjs/common';
import { ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/** Checks the app and its database; used by the post-deploy smoke test, not by periodic probes (Neon must be able to sleep). */
@ApiTags('public')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

/**
 * TEMPORARY, public on the owner's call: a forced 500, logged at error level, to check the API error Alertas end to
 * end (docs/specs/infra.md). Anyone can trip the error and 5xx alarms with it (and, while they are in ALARM, a real
 * error makes no new Alerta), so delete it once the checks are done. No rate limit on purpose: the Postgres counter
 * would wake the database on every call; this route touches nothing.
 */
@ApiExcludeController()
@Public()
@Controller('test-error')
export class TestErrorController {
  @Get()
  fail(): never {
    throw new Error('Test error, forced by the admin to check the Alertas');
  }
}

@Module({ controllers: [HealthController, TestErrorController] })
export class HealthModule {}
