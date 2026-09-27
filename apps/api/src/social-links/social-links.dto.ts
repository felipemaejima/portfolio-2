import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateSocialLinkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label: string;

  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  url: string;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdateSocialLinkDto extends PartialType(CreateSocialLinkDto) {}
