import { Body, Controller, Get, HttpCode, Inject, Logger, Patch, Post, Redirect, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiFoundResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ADMIN_AUTH } from './auth.guard';
import { InjectThrottlerStorage, Throttle, type ThrottlerStorage } from '@nestjs/throttler';
import { ClientIpThrottlerGuard, clientIp } from '../common/client-ip-throttler.guard';
import { cut, postToDiscord } from '../common/discord';
import type { CookieOptions, Request, Response } from 'express';
import { Public } from '../common/public.decorator';
import { CONFIG, type Config } from '../config/config';
import type { Admin } from '../generated/prisma/client';
import { AccessTokenDto, ChangePasswordDto, LoginDto } from './auth.dto';
import { AdminId } from './auth.guard';
import { AuthService } from './auth.service';
import { GOOGLE_CALLBACK_PATH, GoogleProvider, type GoogleAccount } from './google.provider';
import { openPendingFlow, PENDING_FLOW_TTL_MS, sealPendingFlow, type PendingFlow } from './pending-flow-cookie';
import { randomBytes } from 'node:crypto';

export const REFRESH_COOKIE = 'refresh_token';
export const PENDING_FLOW_COOKIE = 'google_oauth';

const randomToken = () => randomBytes(32).toString('base64url'); // 43 chars: also a valid PKCE code_verifier
const logger = new Logger('GoogleLogin');

/** Where a Login pelo Google attempt that opened no session sends the browser: /admin?google=<code>. */
type GoogleFailure = 'erro' | 'cancelado' | 'nao-vinculada';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleProvider,
    @InjectThrottlerStorage() private readonly counters: ThrottlerStorage,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Public()
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenDto> {
    return this.openSession(await this.auth.findByCredentials(dto.email, dto.password), 'Senha', req, res);
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
  // Rate-limited like login: a stolen access token must not guess passwords without limit.
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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

  /** Login pelo Google, start: fresh state, nonce and PKCE verifier, sealed in a cookie, and off to Google. */
  @Public()
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('auth/google')
  @Redirect()
  @ApiFoundResponse({ description: 'To Google, or to /admin?google=erro without Google credentials' })
  async googleStart(@Res({ passthrough: true }) res: Response) {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_STATE_SECRET } = this.config;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !OAUTH_STATE_SECRET) return { url: '/admin?google=erro' };
    const flow: PendingFlow = { intent: 'login', state: randomToken(), nonce: randomToken(), codeVerifier: randomToken() };
    let url: string;
    try {
      url = await this.google.authorizationUrl(flow);
    } catch (error) {
      logger.error(`Google discovery failed: ${(error as Error).message}`); // ours (or Google's), never the caller's
      return { url: '/admin?google=erro' };
    }
    res.cookie(PENDING_FLOW_COOKIE, sealPendingFlow(flow, OAUTH_STATE_SECRET), this.pendingFlowCookieOptions());
    return { url };
  }

  /** Login pelo Google, Google's callback. Only ever redirects to fixed paths of the panel, never to one from the request. */
  @Public()
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('auth/google/callback')
  @Redirect()
  @ApiFoundResponse({ description: 'To /admin with a session, or to /admin?google=erro|cancelado|nao-vinculada' })
  async googleCallback(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(PENDING_FLOW_COOKIE, { ...this.pendingFlowCookieOptions(), maxAge: undefined }); // whatever happens
    const attempt = await this.googleLogin(req);
    if (typeof attempt === 'string') return { url: `/admin?google=${attempt}` };
    await this.openSession(attempt.admin, `Google (${attempt.email})`, req, res);
    return { url: '/admin' };
  }

  /**
   * Which Admin Google proves, or why not. Failures someone can cause just by calling the callback are logged as warn,
   * never error: they must not raise an Alerta. The query string is never logged (it carries the authorization code).
   */
  private async googleLogin(req: Request): Promise<{ admin: Admin; email: string } | GoogleFailure> {
    const refuse = (failure: GoogleFailure, reason: string) => {
      logger.warn(`Login pelo Google attempt refused: ${reason}`);
      return failure;
    };
    const flow = openPendingFlow(req.cookies?.[PENDING_FLOW_COOKIE], this.config.OAUTH_STATE_SECRET);
    if (!flow) return refuse('erro', 'pending-flow cookie missing, altered, expired or sealed with another key');
    if (!(await this.firstUse(flow))) return refuse('erro', 'pending-flow cookie used before');

    const params = new URL(req.originalUrl, 'http://callback').searchParams;
    const error = params.get('error');
    if (error === 'access_denied') return 'cancelado';
    if (error) return refuse('erro', 'Google answered with an error'); // its value is part of the query: not logged
    if (params.get('state') !== flow.state) return refuse('erro', 'state does not match the cookie');

    let account: GoogleAccount;
    try {
      account = await this.google.exchange(params, flow);
    } catch (e) {
      const { name, code, error: oauthError } = e as Error & { code?: string; error?: string }; // never the message
      return refuse('erro', `exchange failed: ${[name, code, oauthError].filter(Boolean).join(' ')}`);
    }
    const admin = await this.auth.findByGoogleAccount(account);
    if (!admin) return refuse('nao-vinculada', 'this Google account is not a Conta vinculada');
    return { admin, email: account.email };
  }

  /**
   * A pending flow serves once. The browser drops the cookie on the first callback; a copy replayed within its 10 min is
   * refused here, by a counter of the rate limiter's (shared by every instance) that allows one use per state.
   */
  private async firstUse(flow: PendingFlow) {
    const { totalHits } = await this.counters.increment(`google-flow:${flow.state}`, PENDING_FLOW_TTL_MS, 1, 0, 'google-flow');
    return totalHits === 1;
  }

  /**
   * The one place a session opens, whatever proved who the admin is (`method`, as the Login alert shows it): issues the
   * tokens, sets the refresh cookie and announces the Login.
   */
  private async openSession(admin: Admin, method: string, req: Request, res: Response): Promise<AccessTokenDto> {
    const { accessToken, refreshToken } = await this.auth.issueTokens(admin);
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions());
    await this.announceLogin(method, req);
    return { accessToken };
  }

  /** A Login that wasn't the owner is an incident: a silent message in #alertas. Discord failing never blocks it. */
  private announceLogin(method: string, req: Request) {
    return postToDiscord(
      this.config.DISCORD_ALERTS_WEBHOOK_URL,
      {
        title: 'Login no admin',
        fields: [
          { name: 'Método', value: method, inline: true },
          { name: 'IP', value: clientIp(req, this.config.CLIENT_IP_HEADER), inline: true },
          { name: 'Navegador', value: cut(req.header('user-agent') || 'desconhecido', 200) },
        ],
        timestamp: new Date().toISOString(),
      },
      { silent: true },
    ).catch(() => undefined); // already logged at error level
  }

  /** Lax, unlike the refresh cookie: a Strict cookie doesn't come along on the navigation back from Google. */
  private pendingFlowCookieOptions(): CookieOptions {
    return { httpOnly: true, secure: true, sameSite: 'lax', path: GOOGLE_CALLBACK_PATH, maxAge: PENDING_FLOW_TTL_MS };
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
