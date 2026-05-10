import path from 'node:path';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { loadRootEnvFiles } from './env/load-root-env';

function buildCorsOptions() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const raw = process.env.CORS_ORIGINS || '';
  const allowList = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (nodeEnv !== 'production') {
    return { origin: true, credentials: true };
  }

  if (allowList.length === 0) {
    // 生产环境未配置时：不反射任意 Origin（避免误配成「允许所有」）。
    // 推荐：前端与 API 同站反代（见 docs/RUNBOOK.md），浏览器请求为同源，可不依赖 CORS；
    // 若前后端分离部署，请设置 CORS_ORIGINS=https://你的前端域名
    // eslint-disable-next-line no-console
    console.warn(
      '[sidecar] NODE_ENV=production 且未设置 CORS_ORIGINS：跨域浏览器请求将被拒绝。' +
        '请设置 CORS_ORIGINS（逗号分隔）或使用 Nginx 将 /api 反代到本服务。'
    );
    return {
      origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) return cb(null, true);
        return cb(null, false);
      },
      credentials: true
    };
  }

  return {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true);
      if (allowList.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true
  };
}

async function bootstrap() {
  const envLoad = loadRootEnvFiles();
  if (envLoad?.loadedFiles.length) {
    // eslint-disable-next-line no-console
    console.log(`[sidecar] env files loaded (${envLoad.loadedFiles.length}): ${envLoad.loadedFiles.map((p) => path.basename(p)).join(' → ')}`);
  } else if (envLoad) {
    // eslint-disable-next-line no-console
    console.warn(`[sidecar] repo root ${envLoad.root} has no .env / .env.local / .env.* files`);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProd = (process.env.NODE_ENV || 'development') === 'production';
  // 经 Nginx 等反代时识别 X-Forwarded-*（设为 0 可关闭）
  if (isProd && process.env.TRUST_PROXY !== '0') {
    app.set('trust proxy', 1);
  }
  const bodyLimit = process.env.SIDECAR_BODY_LIMIT?.trim() || '32mb';
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { extended: true, limit: bodyLimit });

  app.enableCors(buildCorsOptions());

  const basePort = process.env.SIDECAR_PORT ? Number(process.env.SIDECAR_PORT) : 3001;
  const portStrategy = (process.env.SIDECAR_PORT_STRATEGY || 'lock').toLowerCase();
  const maxPortTries = Number(process.env.SIDECAR_PORT_MAX_TRIES || 20);
  let port = basePort;
  let started = false;
  let lastErr: unknown = null;

  for (let i = 0; i < maxPortTries; i += 1) {
    try {
      await app.listen(port);
      started = true;
      break;
    } catch (err: any) {
      const inUse = err?.code === 'EADDRINUSE';
      if (!inUse) throw err;
      lastErr = err;
      if (portStrategy !== 'increment') {
        // eslint-disable-next-line no-console
        console.warn(`[sidecar] port ${port} already in use; skip duplicate startup (SIDECAR_PORT_STRATEGY=lock)`);
        return;
      }
      port += 1;
    }
  }
  if (!started) {
    if (lastErr) throw lastErr;
    throw new Error(`[sidecar] failed to bind port starting from ${basePort}`);
  }
  const envLabel = process.env.NODE_ENV || 'development';
  // eslint-disable-next-line no-console
  console.log(`[sidecar] NODE_ENV=${envLabel} listening on http://localhost:${port} (strategy=${portStrategy})`);
}

bootstrap();

