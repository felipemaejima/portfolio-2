import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PageQuery, ToBoolean } from '../common/query';
import { MEDIA_MIMES } from './media.service';

export class MediaQuery extends PageQuery {
  /** Only media not referenced by the profile or any project. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  unused?: boolean;

  @IsOptional()
  @IsIn(MEDIA_MIMES)
  mime?: string;
}
