import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { CONFIG, type Config } from '../config/config';

/** The real client IP: the trusted edge header in production, the socket address locally. */
export const clientIp = (req: Request, header: string | undefined) =>
  (header && req.header(header)) || req.socket.remoteAddress || 'unknown';

/** Rate-limits per real client IP. */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  @Inject(CONFIG) private readonly config: Config;

  protected override async getTracker(req: Request): Promise<string> {
    return clientIp(req, this.config.CLIENT_IP_HEADER);
  }
}
