import { Controller, Get, Header, Module, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClientIpThrottlerGuard } from '../common/client-ip-throttler.guard';
import type { Request, Response } from 'express';
import { Public } from '../common/public.decorator';
import { LangQuery, PUBLIC_CACHE } from '../common/query';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { CvService } from './cv.service';

@ApiTags('public')
@Public()
@Controller('cv')
export class CvController {
  constructor(private readonly cv: CvService) {}

  /** CV generated on demand from the visible portfolio content. */
  @Get()
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiProduces('application/pdf')
  // Short edge/browser cache absorbs floods of the same URL; the ETag makes revalidation cheap.
  @Header('Cache-Control', PUBLIC_CACHE)
  async get(
    @Query() { lang }: LangQuery,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    const etag = await this.cv.etag(lang);
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.status(304);
      return;
    }
    return new StreamableFile(await this.cv.render(lang), {
      type: 'application/pdf',
      disposition: `attachment; filename="cv-${lang}.pdf"`,
    });
  }
}

@Module({ imports: [PortfolioModule], controllers: [CvController], providers: [CvService] })
export class CvModule {}
