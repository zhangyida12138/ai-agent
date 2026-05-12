import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);

/** 每次生产构建写入 dist/app-version.json，供前端轮询检测部署更新 */
function emitAppVersionPlugin(): Plugin {
  return {
    name: 'emit-app-version',
    writeBundle(outputOptions) {
      const dir = outputOptions.dir;
      if (!dir) return;
      const v = (process.env.VITE_APP_BUILD_ID || '').trim() || String(Date.now());
      fs.writeFileSync(path.join(dir, 'app-version.json'), JSON.stringify({ v }), 'utf8');
    }
  };
}

/**
 * pdf.js 的 worker 默认打进 /assets/*.mjs；部分生产环境对 .mjs MIME 或缓存策略不友好，
 * 导致 Worker / fake worker 的 dynamic import 失败。复制为 dist 根目录的 pdf.worker.js，
 * 前端固定指向该 URL（.js 通常已正确配置为 JavaScript）。
 */
function pdfWorkerPublicPlugin(): Plugin {
  let workerSrcFile = '';
  return {
    name: 'pdf-worker-public',
    configResolved() {
      workerSrcFile = require.resolve('pdfjs-dist/build/pdf.worker.mjs');
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0] ?? '';
        if (!pathname.endsWith('/pdf.worker.js')) {
          next();
          return;
        }
        try {
          const buf = fs.readFileSync(workerSrcFile);
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          res.end(buf);
        } catch {
          next();
        }
      });
    },
    writeBundle(outputOptions) {
      const dir = outputOptions.dir;
      if (!dir) return;
      fs.copyFileSync(workerSrcFile, path.join(dir, 'pdf.worker.js'));
    }
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, repoRoot, '');
  const devPort = Number(env.VITE_DEV_PORT || 5173);
  const devHost = env.VITE_DEV_HOST || '0.0.0.0';
  const proxyTarget = env.SIDECAR_PROXY_TARGET || 'http://127.0.0.1:3001';
  const sidecarPublicUrl = env.VITE_SIDECAR_URL;
  /** 开发 / preview 时：未配置或 `/api` 时走 Vite 代理，避免浏览器直连 Sidecar 的跨域问题 */
  const enableSidecarProxy =
    command === 'serve' && (sidecarPublicUrl === undefined || sidecarPublicUrl === '' || sidecarPublicUrl === '/api');

  return {
    envDir: repoRoot,
    plugins: [react(), emitAppVersionPlugin(), pdfWorkerPublicPlugin()],
    server: {
      strictPort: true,
      port: devPort,
      host: devHost,
      ...(enableSidecarProxy
        ? {
            proxy: {
              '/api': {
                target: proxyTarget,
                changeOrigin: true,
                rewrite: (p) => {
                  const next = p.replace(/^\/api/, '');
                  return next.length ? next : '/';
                }
              }
            }
          }
        : {})
    },
    preview: {
      strictPort: true,
      port: devPort,
      host: devHost,
      ...(enableSidecarProxy
        ? {
            proxy: {
              '/api': {
                target: proxyTarget,
                changeOrigin: true,
                rewrite: (p) => {
                  const next = p.replace(/^\/api/, '');
                  return next.length ? next : '/';
                }
              }
            }
          }
        : {})
    }
  };
});
