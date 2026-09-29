import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ADMIN_AUTH } from '../auth/auth.guard';
import { ReorderDto, VisibilityQuery } from '../common/query';
import {
  CreateSkillCategoryDto,
  CreateSkillDto,
  SkillQuery,
  UpdateSkillCategoryDto,
  UpdateSkillDto,
} from './skills.dto';
import { SkillCategoriesService, SkillsService } from './skills.service';

@ApiTags('admin/skill-categories')
@ApiSecurity(ADMIN_AUTH)
@Controller('admin/skill-categories')
export class SkillCategoriesController {
  constructor(private readonly categories: SkillCategoriesService) {}

  @Get()
  list(@Query() query: VisibilityQuery) {
    return this.categories.list(query);
  }

  @Patch('reorder')
  @HttpCode(204)
  reorder(@Body() dto: ReorderDto) {
    return this.categories.reorder(dto.ids);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.get(id);
  }

  @Post()
  create(@Body() dto: CreateSkillCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSkillCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(id);
  }
}

@ApiTags('admin/skills')
@ApiSecurity(ADMIN_AUTH)
@Controller('admin/skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  list(@Query() query: SkillQuery) {
    return this.skills.list(query);
  }

  @Patch('reorder')
  @HttpCode(204)
  reorder(@Body() dto: ReorderDto) {
    return this.skills.reorder(dto.ids);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.skills.get(id);
  }

  @Post()
  create(@Body() dto: CreateSkillDto) {
    return this.skills.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSkillDto) {
    return this.skills.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.skills.remove(id);
  }
}
