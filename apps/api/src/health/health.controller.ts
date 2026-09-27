import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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

@Module({ controllers: [HealthController] })
export class HealthModule {}
