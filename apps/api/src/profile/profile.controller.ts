import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ADMIN_AUTH } from '../auth/auth.guard';
import { UpsertProfileDto } from './profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('admin/profile')
@ApiSecurity(ADMIN_AUTH)
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
