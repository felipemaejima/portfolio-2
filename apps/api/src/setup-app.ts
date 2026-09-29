import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { join } from 'node:path';
import { REFRESH_COOKIE } from './auth/auth.controller';
import { ACCESS_TOKEN_HEADER, ADMIN_AUTH } from './auth/auth.guard';
import { AppExceptionFilter } from './common/app-exception.filter';
import { MAX_UPLOAD_BYTES } from './media/media.controller';
import { CONFIG, type Config } from './config/config';

export const OPENAPI_FILE = join(__dirname, '..', 'openapi.json');

/** Cross-cutting HTTP setup, shared by main and the e2e tests. */
export function setupApp(app: NestExpressApplication) {
  const config = app.get<Config>(CONFIG);
  const isProduction = config.NODE_ENV === 'production';

  // Same paths everywhere: CloudFront routes /api/* to the Lambda and the rest of the domain to the SPA.
  app.setGlobalPrefix('api');
  app.use(
    helmet({
      // Swagger UI needs inline scripts; it only exists outside production.
      contentSecurityPolicy: isProduction ? undefined : false,
      // Front and API share the site (reverse proxy), so images may be embedded same-site.
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());
  // API responses are private unless a route opts in (see PUBLIC_CACHE): nothing admin-related is ever cached by the CDN.
  app.use('/api', (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Uploads arrive as the raw file body: behind CloudFront OAC the client must send the body's SHA-256, and a browser
  // can't hash a multipart body it doesn't build itself (FormData picks the boundary).
  app.useBodyParser('raw', { type: ['image/*', 'application/octet-stream'], limit: MAX_UPLOAD_BYTES });
  app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AppExceptionFilter(app.get(HttpAdapterHost).httpAdapter));

  if (config.STORAGE_DRIVER === 'local') {
    app.use('/uploads', express.static(config.UPLOADS_DIR, { index: false, dotfiles: 'deny' }));
  }
  if (!isProduction) SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));
}

export function createOpenApiDocument(app: NestExpressApplication) {
  const options = new DocumentBuilder()
    .setTitle('Portfolio API')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: ACCESS_TOKEN_HEADER, description: 'Bearer <access token>' }, ADMIN_AUTH)
    .addCookieAuth(REFRESH_COOKIE)
    .build();
  return SwaggerModule.createDocument(app, options);
}
