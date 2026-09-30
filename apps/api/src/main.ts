import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { CONFIG, type Config } from './config/config';
import { setupApp } from './setup-app';
import { loadSecretsFromSsm } from './ssm-secrets';

async function bootstrap() {
  // Before anything reads the configuration: in production the secrets come from SSM, not from env vars.
  await loadSecretsFromSsm();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });
  setupApp(app);
  app.enableShutdownHooks();
  await app.listen(app.get<Config>(CONFIG).PORT);
}
void bootstrap();
