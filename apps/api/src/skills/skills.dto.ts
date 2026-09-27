import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { LocalizedTextDto } from '../common/localized-text';
import { VisibilityQuery } from '../common/query';

export class CreateSkillCategoryDto {
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  name: LocalizedTextDto;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdateSkillCategoryDto extends PartialType(CreateSkillCategoryDto) {}

export class CreateSkillDto {
  /** Technology name; not translated. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdateSkillDto extends PartialType(CreateSkillDto) {}

export class SkillQuery extends VisibilityQuery {
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
