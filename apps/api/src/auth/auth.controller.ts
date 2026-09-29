import { Body, Controller, HttpCode, Inject, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ADMIN_AUTH } from './auth.guard';
import { Throttle } from '@nestjs/throttler';
import { ClientIpThrottlerGuard } from '../common/client-ip-throttler.guard';
import type { CookieOptions, Request, Response } from 'express';
import { Public } from '../common/public.decorator';
import { CONFIG, type Config } from '../config/config';
import { AccessTokenDto, ChangePasswordDto, LoginDto } from './auth.dto';
import { AdminId } from './auth.guard';
import { AuthService } from './auth.service';

export const REFRESH_COOKIE = 'refresh_token';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Public()
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<AccessTokenDto> {
    const { accessToken, refreshToken } = await this.auth.login(dto.email, dto.password);
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions());
    return { accessToken };
  }

  @Public()
  @ApiCookieAuth()
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AccessTokenDto> {
    const { accessToken, refreshToken } = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions());
    return { accessToken };
  }

  /** Ends every session of the admin (all refresh tokens stop working). */
  @ApiSecurity(ADMIN_AUTH)
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@AdminId() adminId: string, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeSessions(adminId);
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }

  /** Also ends every session. */
  @ApiSecurity(ADMIN_AUTH)
  @Patch('admin/account/password')
  @HttpCode(204)
  async changePassword(
    @AdminId() adminId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(adminId, dto.currentPassword, dto.newPassword);
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: this.config.REFRESH_COOKIE_PATH,
      maxAge: this.config.JWT_REFRESH_TTL_SECONDS * 1000,
    };
  }
}
