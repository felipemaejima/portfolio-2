import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { writeFile } from 'node:fs/promises';
import { AppModule } from './app.module';
import { createOpenApiDocument, OPENAPI_FILE } from './setup-app';

/** Writes the versioned OpenAPI spec without starting the HTTP server or connecting to the database. */
async function exportOpenApi() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  await writeFile(OPENAPI_FILE, `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`);
  await app.close();
  console.log(`OpenAPI spec written to ${OPENAPI_FILE}`);
}

void exportOpenApi();
