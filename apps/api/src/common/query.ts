import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { LANGS, type Lang } from './localized-text';

/** Query strings arrive as text; only the literals "true"/"false" become booleans. */
export const ToBoolean = () =>
  Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value));

export const ToList = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value,
  );

/** Public GETs may be cached briefly by browsers. (CloudFront doesn't cache the API: see infra/main/web.tf.) */
export const PUBLIC_CACHE = 'public, max-age=60';

export const ORDER = [{ position: 'asc' }, { createdAt: 'asc' }] as const;

export class LangQuery {
  @IsOptional()
  @IsIn(LANGS)
  lang: Lang = 'pt';
}

export class VisibilityQuery {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  visible?: boolean;
}

export class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 20;
}

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export class ReorderDto {
  /** Every id of the collection, in the desired order. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids: string[];
}
