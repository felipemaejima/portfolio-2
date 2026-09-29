import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator';
import { LangQuery, PUBLIC_CACHE } from '../common/query';
import { PortfolioService } from './portfolio.service';

@ApiTags('public')
@Public()
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE)
  get(@Query() { lang }: LangQuery) {
    return this.portfolio.get(lang);
  }
}
