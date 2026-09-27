import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LocalizedTextDto } from '../common/localized-text';
import { ToBoolean, VisibilityQuery } from '../common/query';
import { DatePrecision } from '../generated/prisma/client';

export class CreateExperienceDto {
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  role: LocalizedTextDto;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  company: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LocalizedTextDto)
  bullets: LocalizedTextDto[];

  @Type(() => Date)
  @IsDate()
  startDate: Date;

  /** Null or omitted = current position. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date | null;

  @IsOptional()
  @IsEnum(DatePrecision)
  datePrecision?: DatePrecision;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdateExperienceDto extends PartialType(CreateExperienceDto) {}

export class ExperienceQuery extends VisibilityQuery {
  /** true = no end date. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  current?: boolean;
}
