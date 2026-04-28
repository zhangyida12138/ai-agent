import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
    plugins: [react()],
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
