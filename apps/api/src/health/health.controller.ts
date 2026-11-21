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

/** Admin only: a forced 500, logged at error level, to check the API error Alertas end to end (docs/specs/infra.md). */
@ApiExcludeController()
@Controller('admin/test-error')
export class TestErrorController {
  @Get()
  fail(): never {
    throw new Error('Test error, forced by the admin to check the Alertas');
  }
}

@Module({ controllers: [HealthController, TestErrorController] })
export class HealthModule {}
