import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { LocalizedTextDto } from '../common/localized-text';

export class CreateServiceDto {
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title: LocalizedTextDto;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  description: LocalizedTextDto;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}
