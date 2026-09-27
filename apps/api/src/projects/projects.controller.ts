import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator';
import { ReorderDto } from '../common/query';
import { AdminProjectQuery, CreateProjectDto, PublicProjectQuery, UpdateProjectDto } from './projects.dto';
import { ProjectsService } from './projects.service';

@ApiTags('public')
@Public()
@Controller('projects')
export class PublicProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /** All visible projects (the "see all projects" page). */
  @Get()
  list(@Query() query: PublicProjectQuery) {
    return this.projects.listPublic(query, query.lang);
  }
}

@ApiTags('admin/projects')
@ApiBearerAuth()
@Controller('admin/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Query() query: AdminProjectQuery) {
    return this.projects.list(query);
  }

  @Patch('reorder')
  @HttpCode(204)
  reorder(@Body() dto: ReorderDto) {
    return this.projects.reorder(dto.ids);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.get(id);
  }

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.remove(id);
  }
}
