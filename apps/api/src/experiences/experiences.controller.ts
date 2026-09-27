import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ADMIN_AUTH } from '../auth/auth.guard';
import { ReorderDto } from '../common/query';
import { CreateExperienceDto, UpdateExperienceDto, ExperienceQuery } from './experiences.dto';
import { ExperiencesService } from './experiences.service';

@ApiTags('admin/experiences')
@ApiSecurity(ADMIN_AUTH)
@Controller('admin/experiences')
export class ExperiencesController {
  constructor(private readonly experiences: ExperiencesService) {}

  @Get()
  list(@Query() query: ExperienceQuery) {
    return this.experiences.list(query);
  }

  @Patch('reorder')
  @HttpCode(204)
  reorder(@Body() dto: ReorderDto) {
    return this.experiences.reorder(dto.ids);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.experiences.get(id);
  }

  @Post()
  create(@Body() dto: CreateExperienceDto) {
    return this.experiences.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExperienceDto) {
    return this.experiences.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.experiences.remove(id);
  }
}
