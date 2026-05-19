# 运行与验收手册

## 1. 启动

在仓库根目录执行：

```powershell
pnpm --filter @ai-agent/sidecar dev
```

另开一个终端：

```powershell
pnpm --filter @ai-agent/desktop dev
```

打开：

- `http://localhost:5173/`

## 2. 快速验收（UI）

1. 打开页面，确认左侧会话区可见。
2. 在“本地知识库”面板粘贴一段文本并点击“导入到本地知识库”。
3. 勾选“使用本地知识库（RAG）”。
4. 在聊天框提问与该文本相关的问题并发送。
5. 观察回复是否包含 evidence 信息（来源/分数/片段）。

## 3. 快速验收（API）

### 健康检查

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:3001/health"
```

### 导入文本

```powershell
$body=@{
  requestId=[guid]::NewGuid().ToString()
  title='demo'
  sourcePath='manual'
  text='local knowledge base for testing retrieval'
  options=@{chunkSize=40; overlap=5}
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3001/knowledge/ingest-text" -ContentType "application/json" -Body $body
```

### 发送聊天（启用 RAG）

```powershell
$cid=[guid]::NewGuid().ToString()
$body=@{
  requestId=[guid]::NewGuid().ToString()
  conversationId=$cid
  userMessage='How does retrieval work?'
  options=@{useLocalKnowledge=$true; retrievalTopK=3; maxEvidenceChars=2000}
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3001/chat/send" -ContentType "application/json" -Body $body
```

## 4. 生产部署与跨域（CORS）

### 4.1 推荐：Nginx 同域反代（前端无跨域）

浏览器只访问一个站点（例如 `https://notgonnalieplz.site`），静态页与 `/api` 同源：

- 静态资源：`location /` → `dist`（`pnpm --filter @ai-agent/desktop build` 产物）
- API：`location /api/` → 反代到本机 Sidecar（去掉前缀后路径应对齐 Nest 路由，如 `/conversations`）

示例（**`ssl_certificate` 等按你服务器上 Let’s Encrypt 或证书路径修改**；`root` 指向 `apps/desktop/dist` 的部署目录）：

```nginx
server {
  listen 443 ssl http2;
  server_name notgonnalieplz.site www.notgonnalieplz.site;

  ssl_certificate     /etc/letsencrypt/live/notgonnalieplz.site/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/notgonnalieplz.site/privkey.pem;

  root /var/www/ai-agent/desktop;
  index index.html;

  # 知识库上传等接口 JSON 较大；省略时 Nginx 默认约 1m，会返回 413 HTML 错误页
  client_max_body_size 32m;

  location /api/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

另可复制仓库内 `deploy/nginx-notgonnalieplz.site.conf` 作为起点。

注意：`proxy_pass` 末尾带 `/` 时，会把 `/api/foo` 转成后端 `/foo`，与前端 `VITE_SIDECAR_URL=/api`（请求 `/api/conversations` → 后端 `/conversations`）一致。

**若知识库上传报 HTTP 413 / 前端提示「接口未返回 JSON」**：多为反代未放行大请求体。除上述 `client_max_body_size` 外，Sidecar 进程可通过环境变量 `SIDECAR_BODY_LIMIT`（默认 `32mb`）与之一致或略小；修改 Nginx 后务必 `sudo nginx -t && sudo systemctl reload nginx`。

构建前在仓库根目录准备 `.env.production`，至少包含：

- `VITE_SIDECAR_URL=/api`
- `CORS_ORIGINS=https://notgonnalieplz.site,https://www.notgonnalieplz.site`（与浏览器实际访问的 **Origin** 一致；`apex` 与 `www` 需分别列出）

**AI 模型密钥（LangChain 多提供商，勿提交到 git）**

在仓库根目录复制 `.env.example` 为 `.env` / `.env.production`，至少配置：

| 变量                                 | 说明                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `ZHIPU_API_KEY`                      | 主路（国内推荐，OpenAI 兼容接口）                                            |
| `DEEPSEEK_API_KEY`                   | 备用路                                                                       |
| `GEMINI_API_KEY` 或 `GOOGLE_API_KEY` | 备用路（访问 Google 常需 `HTTPS_PROXY`）                                     |
| `AI_PRIMARY_PROVIDER`                | 默认 `zhipu`（智谱）                                                         |
| `AI_FALLBACK_PROVIDER`               | 默认 `deepseek`                                                              |
| `ZHIPU_API_KEY`                      | 智谱 Open API Key（[开放平台](https://open.bigmodel.cn/usercenter/apikeys)） |
| `ZHIPU_MODEL`                        | 默认 `glm-4-flash`                                                           |
| `DEEPSEEK_MODEL` / `GEMINI_MODEL`    | 可选，覆盖默认模型名                                                         |

推荐注入方式（任选其一）：

1. **仅服务器上的 `.env.production`**：写入 `DEEPSEEK_API_KEY`、`GEMINI_API_KEY` 等，文件权限建议 `chmod 600 .env.production`。
2. **systemd**：`EnvironmentFile=/etc/ai-agent/secrets.env`（仅 root 可读）。
3. **启动前 export**（临时）：`export DEEPSEEK_API_KEY=... GEMINI_API_KEY=...` 后执行 `pnpm --filter @ai-agent/sidecar start`。
4. **Docker**：`docker run -e DEEPSEEK_API_KEY=... -e GEMINI_API_KEY=... ...`

说明：进程在加载 `.env*` **之前**已存在且非空的密钥不会被 env 文件里的空行覆盖，便于「文件里留占位、密钥只由 systemd 注入」。

Sidecar 在服务器上：

```powershell
pnpm --filter @ai-agent/shared build
pnpm --filter @ai-agent/sidecar build
$env:NODE_ENV="production"
pnpm --filter @ai-agent/sidecar start
```

（Linux 可用 `export NODE_ENV=production`；`start` 脚本已内置 `NODE_ENV=production`。）

### 4.2 前后端分离（不同域名）

- 构建前端时设置 `VITE_SIDECAR_URL=https://api.example.com`
- Sidecar 的 `.env.production` 中设置 `CORS_ORIGINS=https://app.example.com`（仅允许你的前端站点）

### 4.3 本地预览生产包

`pnpm --filter @ai-agent/desktop preview` 在 `VITE_SIDECAR_URL=/api` 时同样走 Vite 代理（需本机 Sidecar 已启动）。

---

## 5. 常见问题

### 5.1 前端提示「接口未返回 JSON（HTTP 502）」且内容为 Nginx HTML

说明 **Nginx 能收到请求，但反代目标 `127.0.0.1:3001` 无可用 Sidecar**（进程未启动、崩溃、或端口策略导致新实例未监听）。

在服务器上依次排查：

```bash
# 1) 本机 Sidecar 是否存活
curl -sS http://127.0.0.1:3001/health

# 2) PM2 状态与最近日志
pm2 describe ai-agent
pm2 logs ai-agent --lines 80

# 3) 3001 端口谁在监听
sudo ss -lntp | grep 3001

# 4) 从仓库根目录手动启动（看报错）
cd /path/to/ai-agent
export NODE_ENV=production
node apps/sidecar/dist/main.js
```

常见原因与处理：

| 现象                                                                 | 处理                                                                                                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `curl :3001` 连接被拒绝                                              | `pm2 restart deploy/ecosystem.config.cjs --env production`；确认已 `pnpm build` 且存在 `apps/sidecar/dist/main.js`                                               |
| 日志 `port 3001 already in use; skip duplicate startup`              | 旧进程占端口：`pm2 delete ai-agent` 后重新 `pm2 start deploy/ecosystem.config.cjs --env production`                                                              |
| 部署后仍 502                                                         | 检查 Nginx `root` 与 `proxy_pass`：`root` 应为 `/var/www/ai-agent`，`/api/` → `http://127.0.0.1:3001/`                                                           |
| 仅 HTTPS 站点 502                                                    | 确认 **443** 的 `server` 块里也有 `location /api/`，不要只配了 80                                                                                                |
| 构建失败但静态已更新                                                 | 勿用 `pnpm install --prod` 再 build；应完整 `pnpm install` 后 `pnpm build`                                                                                       |
| PM2 日志 `webidl.util.markAsUncloneable is not a function`（undici） | 多为 **undici 8 与 Node 版本不匹配**；拉取最新代码（undici 6 + 延迟加载）后 `pnpm install && pnpm build && pm2 restart ai-agent`；建议 Node **22+**（`node -v`） |

经 Nginx 自检（本机）：

```bash
curl -sS -k https://127.0.0.1/api/health -H 'Host: notgonnalieplz.site'
```

应返回 JSON，而非 `<html>502 Bad Gateway</html>`。

- 端口被占用：关闭占用 `3001` 或 `5173` 的进程后重启。
- Sidecar 重复启动（`EADDRINUSE`）：
  - `SIDECAR_PORT_STRATEGY=lock`（默认）：若 `3001` 已占用则跳过重复实例启动，不再报错退出。
  - `SIDECAR_PORT_STRATEGY=increment`：自动尝试 `3002`、`3003`...
  - 可选 `SIDECAR_PORT_MAX_TRIES=20`：控制自增模式最大尝试次数。
- 模型配置报错：未配置 `DEEPSEEK_API_KEY` / `GEMINI_API_KEY` 时会返回 `PROVIDER_NOT_CONFIGURED`；主路失败且备用密钥已配置时会自动切换 Gemini。
- 看不到知识效果：确认已导入文本、`useLocalKnowledge=true`、提问内容与导入文本相关。
- 生产环境接口报 CORS：检查 `CORS_ORIGINS` 是否包含前端页面的完整 Origin（含 `https://`）；或改用上文同域反代方案。
