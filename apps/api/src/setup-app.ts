import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { join } from 'node:path';
import { REFRESH_COOKIE } from './auth/auth.controller';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { CONFIG, type Config } from './config/config';

export const OPENAPI_FILE = join(__dirname, '..', 'openapi.json');

/** Cross-cutting HTTP setup, shared by main and the e2e tests. */
export function setupApp(app: NestExpressApplication) {
  const config = app.get<Config>(CONFIG);
  const isProduction = config.NODE_ENV === 'production';

  app.set('trust proxy', config.TRUST_PROXY);
  app.use(
    helmet({
      // Swagger UI needs inline scripts; it only exists outside production.
      contentSecurityPolicy: isProduction ? undefined : false,
      // Front and API share the site (reverse proxy), so images may be embedded same-site.
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());
  app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter));

  if (config.STORAGE_DRIVER === 'local') {
    app.use('/uploads', express.static(config.UPLOADS_DIR, { index: false, dotfiles: 'deny' }));
  }
  if (!isProduction) SwaggerModule.setup('docs', app, createOpenApiDocument(app));
}

export function createOpenApiDocument(app: NestExpressApplication) {
  const options = new DocumentBuilder()
    .setTitle('Portfolio API')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth(REFRESH_COOKIE)
    .build();
  return SwaggerModule.createDocument(app, options);
}
