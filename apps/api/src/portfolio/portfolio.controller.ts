import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator';
import { LangQuery } from '../common/query';
import { PortfolioService } from './portfolio.service';

@ApiTags('public')
@Public()
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  get(@Query() { lang }: LangQuery) {
    return this.portfolio.get(lang);
  }
}
