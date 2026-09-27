import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { LocalizedTextDto } from '../common/localized-text';
import { ToBoolean, VisibilityQuery } from '../common/query';
import { DatePrecision, EducationKind } from '../generated/prisma/client';

export class CreateEducationDto {
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title: LocalizedTextDto;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  institution: string;

  @IsEnum(EducationKind)
  kind: EducationKind;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date | null;

  /** Null or omitted = ongoing (or single-date entries such as a certification). */
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

export class UpdateEducationDto extends PartialType(CreateEducationDto) {}

export class EducationQuery extends VisibilityQuery {
  @IsOptional()
  @IsEnum(EducationKind)
  kind?: EducationKind;

  /** true = no end date. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  current?: boolean;
}
