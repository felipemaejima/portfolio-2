import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LANGS, LocalizedTextDto, type Lang } from '../common/localized-text';
import { PageQuery, ToBoolean, ToList } from '../common/query';

const URL_OPTIONS = { require_protocol: true, protocols: ['http', 'https'] };

export class CreateProjectDto {
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title: LocalizedTextDto;

  @ValidateNested()
  @Type(() => LocalizedTextDto)
  description: LocalizedTextDto;

  /** Technology tags, displayed as written; matched case-insensitively. */
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(40, { each: true })
  tags: string[];

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(500)
  repoUrl?: string | null;

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(500)
  demoUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsUUID()
  imageMediaId?: string | null;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

export class ProjectFilterQuery extends PageQuery {
  /** Comma-separated. */
  @IsOptional()
  @ToList()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  /** any (default): at least one tag matches; all: every tag matches. */
  @IsOptional()
  @IsIn(['any', 'all'])
  tagsMode: 'any' | 'all' = 'any';

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  featured?: boolean;

  /** Accent-insensitive text search in title and description. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['position', '-createdAt'])
  sort: 'position' | '-createdAt' = 'position';
}

export class PublicProjectQuery extends ProjectFilterQuery {
  @IsOptional()
  @IsIn(LANGS)
  lang: Lang = 'pt';
}

export class AdminProjectQuery extends ProjectFilterQuery {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  visible?: boolean;
}
