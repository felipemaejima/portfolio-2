import { ArgumentsHost, Catch, ConflictException, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../generated/prisma/client';

const HTTP_ERRORS: Record<string, () => Error> = {
  P2025: () => new NotFoundException(),
  P2002: () => new ConflictException('Resource already exists'),
  P2003: () => new ConflictException('Resource is referenced by another record'),
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    super.catch(HTTP_ERRORS[error.code]?.() ?? error, host);
  }
}
