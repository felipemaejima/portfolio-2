import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from '../common/public.decorator';
import { AuthService } from './auth.service';

type AuthedRequest = Request & { adminId?: string };

/**
 * The admin access token travels as `X-Authorization: Bearer <token>`, not in `Authorization`: in production
 * CloudFront signs every request to the Lambda origin (OAC) and overwrites `Authorization` with its own signature.
 */
export const ACCESS_TOKEN_HEADER = 'x-authorization';
export const ADMIN_AUTH = 'admin';

/** Global guard: every route requires a valid access token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = request.header(ACCESS_TOKEN_HEADER)?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    request.adminId = this.auth.verifyAccessToken(token);
    return true;
  }
}

export const AdminId = createParamDecorator(
  (_: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<AuthedRequest>().adminId!,
);
