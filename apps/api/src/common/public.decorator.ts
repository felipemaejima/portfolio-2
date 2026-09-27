import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Routes are admin-only by default; this opts a route out of authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
