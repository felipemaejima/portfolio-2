import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpsertProfileDto } from './profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('admin/profile')
@ApiBearerAuth()
@Controller('admin/profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get() {
    return this.profile.get();
  }

  @Put()
  upsert(@Body() dto: UpsertProfileDto) {
    return this.profile.upsert(dto);
  }
}
