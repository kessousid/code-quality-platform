import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opt a route out of ApiTokenGuard. Used only by /health and Swagger's own routes. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
