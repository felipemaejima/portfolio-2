import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ADMIN_AUTH } from '../auth/auth.guard';
import { ReorderDto, VisibilityQuery } from '../common/query';
import { CreateServiceDto, UpdateServiceDto } from './services.dto';
import { ServicesService } from './services.service';

@ApiTags('admin/services')
@ApiSecurity(ADMIN_AUTH)
@Controller('admin/services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  list(@Query() query: VisibilityQuery) {
    return this.services.list(query);
  }

  @Patch('reorder')
  @HttpCode(204)
  reorder(@Body() dto: ReorderDto) {
    return this.services.reorder(dto.ids);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.services.get(id);
  }

  @Post()
  create(@Body() dto: CreateServiceDto) {
    return this.services.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto) {
    return this.services.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.services.remove(id);
  }
}
