import { ArgumentsHost, Catch, ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../generated/prisma/client';

const PRISMA_ERRORS: Record<string, () => HttpException> = {
  P2025: () => new NotFoundException(),
  P2002: () => new ConflictException('Resource already exists'),
  P2003: () => new ConflictException('Resource is referenced by another record'),
};

type ClientHttpError = Error & { status: number; expose: true };

// Errors from Express middleware (body-parser: 413 too large, 400 malformed JSON) carry a 4xx status but aren't
// HttpExceptions, so Nest would log them as server errors — log noise anyone could trigger on purpose.
const isClientHttpError = (error: unknown): error is ClientHttpError =>
  error instanceof Error &&
  (error as Partial<ClientHttpError>).expose === true &&
  typeof (error as Partial<ClientHttpError>).status === 'number' &&
  (error as ClientHttpError).status >= 400 &&
  (error as ClientHttpError).status < 500;

/** Maps known non-Nest errors to HTTP errors; anything else keeps Nest's default handling (500 + error log). */
@Catch()
export class AppExceptionFilter extends BaseExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return super.catch(PRISMA_ERRORS[error.code]?.() ?? error, host);
    }
    if (isClientHttpError(error)) return super.catch(new HttpException(error.message, error.status), host);
    super.catch(error, host);
  }
}
