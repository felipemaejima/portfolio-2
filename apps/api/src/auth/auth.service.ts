import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { CONFIG, type Config } from '../config/config';
import { Prisma, type Admin } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { GoogleAccount } from './google.provider';

type RefreshPayload = { sub: string; ver: number };

@Injectable()
export class AuthService {
  // Verified against when the email is unknown, so both paths cost the same (no user enumeration by timing).
  private readonly dummyHash = argon2.hash(randomUUID());

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** The Admin the email and password prove; opening the session is up to the caller. */
  async findByCredentials(email: string, password: string) {
    const admin = await this.prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    const valid = await argon2.verify(admin?.passwordHash ?? (await this.dummyHash), password);
    if (!admin || !valid) throw new UnauthorizedException('Invalid credentials');
    return admin;
  }

  /** The Admin whose Conta vinculada this Google account is, refreshing its displayed email; undefined without one. */
  async findByGoogleAccount({ subject, email }: GoogleAccount) {
    const linked = await this.prisma.linkedAccount.findUnique({
      where: { provider_subject: { provider: 'GOOGLE', subject } },
      include: { admin: true },
    });
    if (!linked) return undefined;
    if (linked.email !== email) await this.prisma.linkedAccount.update({ where: { id: linked.id }, data: { email } });
    return linked.admin;
  }

  async refresh(token: string | undefined) {
    const payload = await this.jwt
      .verifyAsync<RefreshPayload>(token ?? '', { secret: this.config.JWT_REFRESH_SECRET, algorithms: ['HS256'] })
      .catch(() => {
        throw new UnauthorizedException();
      });
    const admin = await this.prisma.admin.findUnique({ where: { id: payload.sub } });
    if (!admin || admin.tokenVersion !== payload.ver) throw new UnauthorizedException();
    return this.issueTokens(admin);
  }

  /** Returns the admin id; stateless, never touches the database. */
  verifyAccessToken(token: string): string {
    try {
      return this.jwt.verify<{ sub: string }>(token, { secret: this.config.JWT_ACCESS_SECRET, algorithms: ['HS256'] }).sub;
    } catch {
      throw new UnauthorizedException();
    }
  }

  /** Invalidates every refresh token issued so far. */
  async revokeSessions(adminId: string) {
    await this.prisma.admin.update({ where: { id: adminId }, data: { tokenVersion: { increment: 1 } } });
  }

  async changePassword(adminId: string, currentPassword: string, newPassword: string) {
    const minLength = this.config.PASSWORD_MIN_LENGTH;
    if (newPassword.length < minLength) throw new BadRequestException(`newPassword must be at least ${minLength} characters`);
    await this.verifyCurrentPassword(adminId, currentPassword);
    await this.prisma.admin.update({
      where: { id: adminId },
      data: { passwordHash: await argon2.hash(newPassword), tokenVersion: { increment: 1 } },
    });
  }

  /** The admin's Conta vinculada Google; 404 without one. */
  googleAccount(adminId: string) {
    return this.prisma.linkedAccount.findUniqueOrThrow({ where: { adminId_provider: { adminId, provider: 'GOOGLE' } } });
  }

  /** The Admin about to link a Google account: current password confirmed (403), none linked yet (409). */
  async authorizeGoogleLink(adminId: string, currentPassword: string) {
    const admin = await this.verifyCurrentPassword(adminId, currentPassword);
    const linked = await this.prisma.linkedAccount.count({ where: { adminId, provider: 'GOOGLE' } });
    if (linked) throw new ConflictException('A Google account is already linked');
    return admin;
  }

  /**
   * Links the Google account in one statement, or returns false: when the admin's sessions changed since the link
   * started (a logout or password change wins) or either side is already linked (the unique keys).
   */
  async linkGoogleAccount(adminId: string, tokenVersion: number, { subject, email }: GoogleAccount) {
    try {
      await this.prisma.admin.update({
        where: { id: adminId, tokenVersion },
        data: { linkedAccounts: { create: { provider: 'GOOGLE', subject, email } } },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2002'].includes(error.code)) return false;
      throw error;
    }
  }

  /** Unlinks and ends every session (404 without a link): whoever got in through that account loses access now. */
  async unlinkGoogleAccount(adminId: string) {
    const [unlinked] = await this.prisma.$transaction([
      this.prisma.linkedAccount.delete({ where: { adminId_provider: { adminId, provider: 'GOOGLE' } } }),
      this.prisma.admin.update({ where: { id: adminId }, data: { tokenVersion: { increment: 1 } } }),
    ]);
    return unlinked;
  }

  private async verifyCurrentPassword(adminId: string, currentPassword: string) {
    const admin = await this.prisma.admin.findUniqueOrThrow({ where: { id: adminId } });
    if (!(await argon2.verify(admin.passwordHash, currentPassword))) throw new ForbiddenException('Invalid current password');
    return admin;
  }

  async issueTokens(admin: Admin) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: admin.id },
        { secret: this.config.JWT_ACCESS_SECRET, expiresIn: this.config.JWT_ACCESS_TTL_SECONDS, algorithm: 'HS256' },
      ),
      this.jwt.signAsync(
        { sub: admin.id, ver: admin.tokenVersion } satisfies RefreshPayload,
        {
          secret: this.config.JWT_REFRESH_SECRET,
          expiresIn: this.config.JWT_REFRESH_TTL_SECONDS,
          algorithm: 'HS256',
          jwtid: randomUUID(),
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }
}
