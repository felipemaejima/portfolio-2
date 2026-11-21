import { Body, Controller, HttpCode, Inject, Module, Post, Req, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { InjectThrottlerStorage, Throttle, type ThrottlerStorage } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { ClientIpThrottlerGuard } from '../common/client-ip-throttler.guard';
import { cut, postToDiscord } from '../common/discord';
import { Public } from '../common/public.decorator';
import { CONFIG, type Config } from '../config/config';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Site-wide ceiling: whatever happens (bots, a viral link), #visitas gets at most this many messages a day. */
const DAILY_CAP = 50;

export class VisitDto {
  @IsIn(['/', '/projetos'])
  page: string;

  @IsIn(['pt', 'en'])
  lang: string;

  /** document.referrer: anyone can send anything, so only its domain is kept. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrer?: string;
}

/** Where the visitor came from: the referrer's domain, or "direto". */
const origin = (referrer = '') => {
  try {
    return new URL(referrer).hostname || 'direto';
  } catch {
    return 'direto';
  }
};

/** A Visita (see GLOSSARY.md) goes to the owner's #visitas channel on Discord. */
@ApiTags('public')
@Public()
@Controller('visits')
export class VisitsController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @InjectThrottlerStorage() private readonly counters: ThrottlerStorage,
  ) {}

  /**
   * The site calls this at most once a day per browser. Here, one call per IP a day (the guard, counted before the
   * cap so a repeat never spends it), then the site-wide cap. The message never carries the IP: it is personal data
   * (LGPD) and Discord is a third party. Discord failing is logged at error level; the site doesn't wait on the answer.
   */
  @Post()
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Announced, or silently dropped over the daily cap' })
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 1, ttl: DAY_MS } })
  async announce(@Body() dto: VisitDto, @Req() req: Request): Promise<void> {
    const { isBlocked } = await this.counters.increment('visits-daily-cap', DAY_MS, DAILY_CAP, DAY_MS, 'visits');
    if (isBlocked) return;
    await postToDiscord(this.config.DISCORD_VISITS_WEBHOOK_URL, {
      title: 'Visita',
      fields: [
        { name: 'Página', value: dto.page, inline: true },
        { name: 'Idioma', value: dto.lang, inline: true },
        { name: 'Origem', value: origin(dto.referrer), inline: true },
        { name: 'Navegador', value: cut(req.header('user-agent') || 'desconhecido', 200) },
      ],
      timestamp: new Date().toISOString(),
    }).catch(() => undefined); // already logged at error level
  }
}

@Module({ controllers: [VisitsController] })
export class VisitsModule {}
