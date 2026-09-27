import { BadRequestException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { CONFIG, type Config } from '../config/config';
import type { Admin } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

  async login(email: string, password: string) {
    const admin = await this.prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    const valid = await argon2.verify(admin?.passwordHash ?? (await this.dummyHash), password);
    if (!admin || !valid) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(admin);
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
    const admin = await this.prisma.admin.findUniqueOrThrow({ where: { id: adminId } });
    if (!(await argon2.verify(admin.passwordHash, currentPassword))) throw new ForbiddenException('Invalid current password');
    await this.prisma.admin.update({
      where: { id: adminId },
      data: { passwordHash: await argon2.hash(newPassword), tokenVersion: { increment: 1 } },
    });
  }

  private async issueTokens(admin: Admin) {
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
