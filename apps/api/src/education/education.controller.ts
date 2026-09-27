import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ADMIN_AUTH } from '../auth/auth.guard';
import { ReorderDto } from '../common/query';
import { CreateEducationDto, UpdateEducationDto, EducationQuery } from './education.dto';
import { EducationService } from './education.service';

@ApiTags('admin/education')
@ApiSecurity(ADMIN_AUTH)
@Controller('admin/education')
export class EducationController {
  constructor(private readonly education: EducationService) {}

  @Get()
  list(@Query() query: EducationQuery) {
    return this.education.list(query);
  }

  @Patch('reorder')
  @HttpCode(204)
  reorder(@Body() dto: ReorderDto) {
    return this.education.reorder(dto.ids);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.education.get(id);
  }

  @Post()
  create(@Body() dto: CreateEducationDto) {
    return this.education.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEducationDto) {
    return this.education.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.education.remove(id);
  }
}
