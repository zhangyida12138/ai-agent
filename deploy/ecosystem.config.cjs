const path = require('node:path');

/** 仓库根目录（本文件位于 deploy/） */
const repoRoot = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'ai-agent',
      cwd: repoRoot,
      script: 'apps/sidecar/dist/main.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 15,
      min_uptime: '5s',
      listen_timeout: 8000,
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
