import { Body, Controller, Delete, Get, HttpCode, Inject, Logger, Patch, Post, Redirect, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiFoundResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ADMIN_AUTH } from './auth.guard';
import { InjectThrottlerStorage, Throttle, type ThrottlerStorage } from '@nestjs/throttler';
import { ClientIpThrottlerGuard, clientIp } from '../common/client-ip-throttler.guard';
import { cut, postToDiscord } from '../common/discord';
import type { CookieOptions, Request, Response } from 'express';
import { Public } from '../common/public.decorator';
import { CONFIG, type Config } from '../config/config';
import type { Admin } from '../generated/prisma/client';
import {
  AccessTokenDto,
  ChangePasswordDto,
  CurrentPasswordDto,
  GoogleUrlDto,
  LinkedGoogleAccountDto,
  LoginDto,
} from './auth.dto';
import { AdminId } from './auth.guard';
import { AuthService } from './auth.service';
import { GOOGLE_CALLBACK_PATH, GoogleProvider, type GoogleAccount } from './google.provider';
import {
  openPendingFlow,
  PENDING_FLOW_TTL_MS,
  sealPendingFlow,
  type PendingFlow,
  type PendingIntent,
} from './pending-flow-cookie';
import { randomBytes } from 'node:crypto';

export const REFRESH_COOKIE = 'refresh_token';
export const PENDING_FLOW_COOKIE = 'google_oauth';

const randomToken = () => randomBytes(32).toString('base64url'); // 43 chars: also a valid PKCE code_verifier
const logger = new Logger('GoogleLogin');
/** Logs a refusal someone can cause by calling the callback: warn, never error (no Alerta). */
const refuse = <T extends string>(failure: T, reason: string) => {
  logger.warn(`Google callback refused: ${reason}`);
  return failure;
};

/** Why a trip to Google opened no session: /admin?google=<code> (a link that fails goes to /admin/conta?google=erro). */
type GoogleFailure = 'erro' | 'cancelado' | 'nao-vinculada';
type LinkFlow = Extract<PendingFlow, { intent: 'vincular' }>;

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
    this.clearRefreshCookie(res);
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
    this.clearRefreshCookie(res);
  }

  /** Login pelo Google, start: fresh state, nonce and PKCE verifier, sealed in a cookie, and off to Google. */
  @Public()
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('auth/google')
  @Redirect()
  @ApiFoundResponse({ description: 'To Google, or to /admin?google=erro without Google credentials' })
  async googleStart(@Res({ passthrough: true }) res: Response) {
    return { url: (await this.startGoogleFlow(res, { intent: 'login' })) ?? '/admin?google=erro' };
  }

  @ApiSecurity(ADMIN_AUTH)
  @Get('admin/account/google')
  async linkedGoogleAccount(@AdminId() adminId: string): Promise<LinkedGoogleAccountDto> {
    const { email, createdAt } = await this.auth.googleAccount(adminId);
    return { email, linkedAt: createdAt };
  }

  /**
   * Linking starts from inside the panel and asks for the current password: a stolen access token alone can't link
   * someone else's Google account. Rate-limited like login. The browser then goes to `url`.
   */
  @ApiSecurity(ADMIN_AUTH)
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('admin/account/google')
  @HttpCode(200)
  async startGoogleLink(
    @AdminId() adminId: string,
    @Body() dto: CurrentPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GoogleUrlDto> {
    const { tokenVersion } = await this.auth.authorizeGoogleLink(adminId, dto.currentPassword);
    const url = await this.startGoogleFlow(res, { intent: 'vincular', adminId, tokenVersion });
    return { url: url ?? '/admin/conta?google=erro' };
  }

  /** Also ends every session, like a password change. Needs no password: cutting off a suspicious Login must be quick. */
  @ApiSecurity(ADMIN_AUTH)
  @Delete('admin/account/google')
  @HttpCode(204)
  async unlinkGoogleAccount(@AdminId() adminId: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { email } = await this.auth.unlinkGoogleAccount(adminId);
    this.clearRefreshCookie(res);
    await this.announce(req, 'Conta Google desvinculada', { name: 'Conta', value: email });
  }

  /** Login pelo Google, Google's callback. Only ever redirects to fixed paths of the panel, never to one from the request. */
  @Public()
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('auth/google/callback')
  @Redirect()
  @ApiFoundResponse({
    description: 'To /admin with a session, /admin?google=erro|cancelado|nao-vinculada, or /admin/conta?google=vinculada|erro',
  })
  async googleCallback(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(PENDING_FLOW_COOKIE, { ...this.pendingFlowCookieOptions(), maxAge: undefined }); // whatever happens
    const params = new URL(req.originalUrl, 'http://callback').searchParams;
    const flow = openPendingFlow(req.cookies?.[PENDING_FLOW_COOKIE], this.config.OAUTH_STATE_SECRET);
    const result = flow
      ? await this.googleAccountFor(flow, params)
      : refuse('erro', 'pending-flow cookie missing, altered, expired or sealed with another key');

    // The state starts with the intent: a link whose cookie is gone (say, 10 min on Google) still comes back to Conta.
    if (flow ? flow.intent === 'vincular' : params.get('state')?.startsWith('vincular.')) {
      // An account comes only from an opened flow, so here the flow is a link's.
      const outcome = typeof result === 'string' ? result : await this.linkGoogle(flow as LinkFlow, result, req);
      return { url: outcome === 'cancelado' ? '/admin/conta' : `/admin/conta?google=${outcome}` };
    }
    if (typeof result === 'string') return { url: `/admin?google=${result}` };

    const admin = await this.auth.findByGoogleAccount(result);
    if (!admin) return { url: `/admin?google=${refuse('nao-vinculada', 'this Google account is not a Conta vinculada')}` };
    await this.openSession(admin, `Google (${result.email})`, req, res);
    return { url: '/admin' };
  }

  private async linkGoogle(flow: LinkFlow, account: GoogleAccount, req: Request) {
    if (!(await this.auth.linkGoogleAccount(flow.adminId, flow.tokenVersion, account))) {
      return refuse('erro', 'sessions changed meanwhile, or one side is already linked');
    }
    await this.announce(req, 'Conta Google vinculada', { name: 'Conta', value: account.email });
    return 'vinculada';
  }

  /**
   * The Google account Google vouches for, or why not. Failures someone can cause just by calling the callback are
   * logged as warn, never error: they must not raise an Alerta. The query string is never logged (it carries the code).
   */
  private async googleAccountFor(flow: PendingFlow, params: URLSearchParams): Promise<GoogleAccount | GoogleFailure> {
    if (!(await this.firstUse(flow))) return refuse('erro', 'pending-flow cookie used before');

    const error = params.get('error');
    if (error === 'access_denied') return 'cancelado';
    if (error) return refuse('erro', 'Google answered with an error'); // its value is part of the query: not logged
    if (params.get('state') !== flow.state) return refuse('erro', 'state does not match the cookie');

    try {
      return await this.google.exchange(params, flow);
    } catch (e) {
      const { name, code, error: oauthError } = e as Error & { code?: string; error?: string }; // never the message
      return refuse('erro', `exchange failed: ${[name, code, oauthError].filter(Boolean).join(' ')}`);
    }
  }

  /** Seals a fresh flow for `intent` in the cookie; Google's authorization URL, or undefined when Google can't be used. */
  private async startGoogleFlow(res: Response, intent: PendingIntent): Promise<string | undefined> {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_STATE_SECRET } = this.config;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !OAUTH_STATE_SECRET) return undefined;
    const flow: PendingFlow = { ...intent, state: `${intent.intent}.${randomToken()}`, nonce: randomToken(), codeVerifier: randomToken() };
    try {
      const url = await this.google.authorizationUrl(flow);
      res.cookie(PENDING_FLOW_COOKIE, sealPendingFlow(flow, OAUTH_STATE_SECRET), this.pendingFlowCookieOptions());
      return url;
    } catch (error) {
      logger.error(`Google discovery failed: ${(error as Error).message}`); // ours (or Google's), never the caller's
      return undefined;
    }
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
    await this.announce(req, 'Login no admin', { name: 'Método', value: method });
    return { accessToken };
  }

  /**
   * A Login or a link that wasn't the owner is an incident (linking is how an intruder would keep access): a silent
   * message in #alertas, `field` then the IP and the browser. Discord failing never blocks anything.
   */
  private announce(req: Request, title: string, field: { name: string; value: string }) {
    return postToDiscord(
      this.config.DISCORD_ALERTS_WEBHOOK_URL,
      {
        title,
        fields: [
          { ...field, inline: true },
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

  private clearRefreshCookie(res: Response) {
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
