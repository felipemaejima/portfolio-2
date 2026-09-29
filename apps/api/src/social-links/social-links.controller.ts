import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ADMIN_AUTH } from '../auth/auth.guard';
import { ReorderDto, VisibilityQuery } from '../common/query';
import { CreateSocialLinkDto, UpdateSocialLinkDto } from './social-links.dto';
import { SocialLinksService } from './social-links.service';

@ApiTags('admin/social-links')
@ApiSecurity(ADMIN_AUTH)
@Controller('admin/social-links')
export class SocialLinksController {
  constructor(private readonly links: SocialLinksService) {}

  @Get()
  list(@Query() query: VisibilityQuery) {
    return this.links.list(query);
  }

  @Patch('reorder')
  @HttpCode(204)
  reorder(@Body() dto: ReorderDto) {
    return this.links.reorder(dto.ids);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.links.get(id);
  }

  @Post()
  create(@Body() dto: CreateSocialLinkDto) {
    return this.links.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSocialLinkDto) {
    return this.links.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.links.remove(id);
  }
}
