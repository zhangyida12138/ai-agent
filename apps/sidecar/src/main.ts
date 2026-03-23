import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // For local dev: desktop UI (Vite) -> sidecar API (NestJS)
  app.enableCors({ origin: true, credentials: true });

  const port = process.env.SIDECAR_PORT ? Number(process.env.SIDECAR_PORT) : 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[sidecar] listening on http://localhost:${port}`);
}

bootstrap();

