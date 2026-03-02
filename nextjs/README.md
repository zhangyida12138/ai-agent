# Memo Workspace

可投入使用的备忘录系统，基于 Next.js + Prisma + PostgreSQL + NextAuth。

## 技术栈

- Next.js 15（App Router）
- React 19 + TypeScript
- Prisma + PostgreSQL
- NextAuth（Credentials 登录）
- Zod + React Hook Form
- UnoCSS（utility class）+ shadcn 风格组件封装

## 目录结构

```txt
src/
  app/
    api/
      auth/[...nextauth]/route.ts
      memos/route.ts
      memos/[id]/route.ts
      register/route.ts
    login/page.tsx
    register/page.tsx
    memos/page.tsx
  components/ui/
  features/memos/
    components/
    server/
  lib/
    auth.ts
    db.ts
    validations/
prisma/schema.prisma
```

## 本地启动

1. 安装依赖

```bash
pnpm install
```

2. 配置环境变量

```bash
cp .env.example .env
```

3. 初始化数据库

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

4. 启动开发环境

```bash
pnpm dev
```

## 生产部署（Vercel）

1. 在 Vercel 配置环境变量：`DATABASE_URL`、`NEXTAUTH_URL`、`NEXTAUTH_SECRET`
2. 构建命令：`pnpm build`
3. 启动命令：`pnpm start`
4. 在 CI/CD 或 Vercel Post-Deploy 中执行：`pnpm prisma:deploy`
