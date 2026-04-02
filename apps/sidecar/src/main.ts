import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Load repo-root .env for local dev.
  // pnpm 会在各 workspace 包目录内启动 sidecar，此处需要向上查找根目录的 .env。
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '..', '..', '.env'),
    path.join(process.cwd(), '..', '..', '..', '.env')
  ];
  const envPath = candidates.find((p) => fs.existsSync(p));
  if (envPath) {
    dotenv.config({ path: envPath });
  }

  const app = await NestFactory.create(AppModule);

  // For local dev: desktop UI (Vite) -> sidecar API (NestJS)
  app.enableCors({ origin: true, credentials: true });

  const port = process.env.SIDECAR_PORT ? Number(process.env.SIDECAR_PORT) : 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[sidecar] listening on http://localhost:${port}`);
}

bootstrap();

