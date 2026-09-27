import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LocalizedTextDto } from '../common/localized-text';

export class UpsertProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  headline: LocalizedTextDto;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  summary: LocalizedTextDto;

  /** "About me" paragraphs. */
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => LocalizedTextDto)
  about: LocalizedTextDto[];

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  location: LocalizedTextDto;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  availability: LocalizedTextDto;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  workModality: LocalizedTextDto;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  spokenLanguages: LocalizedTextDto;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsBoolean()
  showEmail: boolean;

  @IsBoolean()
  showPhone: boolean;

  @IsOptional()
  @IsUUID()
  photoMediaId?: string | null;
}
