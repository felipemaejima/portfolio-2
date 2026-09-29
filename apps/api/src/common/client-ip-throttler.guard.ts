import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { CONFIG, type Config } from '../config/config';

/** Rate-limits per real client IP: the trusted edge header in production, the socket address locally. */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  @Inject(CONFIG) private readonly config: Config;

  protected override async getTracker(req: Request): Promise<string> {
    const header = this.config.CLIENT_IP_HEADER;
    return (header && req.header(header)) || req.socket.remoteAddress || 'unknown';
  }
}
