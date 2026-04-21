import { Body, Controller, Get, Headers, Patch, Post } from '@nestjs/common';
import { ChatHistoryStore } from '../db/chat-history-store';

function ok<T>(data: T) {
  return { ok: true as const, code: 'SUCCESS', data };
}

function err(params: { code: string; message: string; retryable: boolean; nextAction?: string }) {
  return { ok: false as const, ...params };
}

function estimateBase64Bytes(dataUrlOrBase64: string): number {
  const base64 = dataUrlOrBase64.includes(',') ? dataUrlOrBase64.split(',')[1] || '' : dataUrlOrBase64;
  const cleaned = base64.replace(/\s+/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
}

@Controller('/auth')
export class AuthController {
  private storePromise = ChatHistoryStore.create();

  @Post('/register')
  async register(@Body() body: any) {
    const username = String(body?.username ?? '').trim();
    const password = String(body?.password ?? '');
    if (!username || password.length < 6) {
      return err({ code: 'INVALID_PARAMS', message: '用户名不能为空且密码至少6位', retryable: false });
    }
    try {
      const store = await this.storePromise;
      const user = await store.createUser(username, password);
      const session = await store.createSession(user.id);
      return ok({ user, token: session.token, expiresAt: session.expiresAt });
    } catch (e: any) {
      if (String(e?.message) === 'USER_EXISTS') {
        return err({ code: 'USER_EXISTS', message: '用户名已存在', retryable: false });
      }
      return err({ code: 'REGISTER_FAILED', message: '注册失败', retryable: true });
    }
  }

  @Post('/login')
  async login(@Body() body: any) {
    const username = String(body?.username ?? '').trim();
    const password = String(body?.password ?? '');
    if (!username || !password) {
      return err({ code: 'INVALID_PARAMS', message: '用户名和密码必填', retryable: false });
    }
    const store = await this.storePromise;
    const user = await store.verifyUser(username, password);
    if (!user) {
      return err({ code: 'INVALID_CREDENTIALS', message: '用户名或密码错误', retryable: false });
    }
    const session = await store.createSession(user.id);
    return ok({ user, token: session.token, expiresAt: session.expiresAt });
  }

  @Get('/me')
  async me(@Headers('authorization') authHeader?: string) {
    const token = this.extractToken(authHeader);
    if (!token) {
      return err({ code: 'UNAUTHORIZED', message: '未登录', retryable: false });
    }
    const store = await this.storePromise;
    const user = await store.getUserByToken(token);
    if (!user) {
      return err({ code: 'UNAUTHORIZED', message: '登录态已失效', retryable: false });
    }
    return ok({ user });
  }

  @Patch('/theme')
  async setTheme(@Headers('authorization') authHeader: string | undefined, @Body() body: any) {
    const token = this.extractToken(authHeader);
    if (!token) {
      return err({ code: 'UNAUTHORIZED', message: '未登录', retryable: false });
    }
    const theme = String(body?.theme ?? '').trim();
    if (theme !== 'dark' && theme !== 'light') {
      return err({ code: 'INVALID_PARAMS', message: 'theme must be dark or light', retryable: false });
    }
    const store = await this.storePromise;
    const user = await store.getUserByToken(token);
    if (!user) {
      return err({ code: 'UNAUTHORIZED', message: '登录态已失效', retryable: false });
    }
    await store.updateUserTheme(user.id, theme);
    return ok({ theme });
  }

  @Patch('/profile')
  async setProfile(@Headers('authorization') authHeader: string | undefined, @Body() body: any) {
    const token = this.extractToken(authHeader);
    if (!token) {
      return err({ code: 'UNAUTHORIZED', message: '未登录', retryable: false });
    }
    const store = await this.storePromise;
    const user = await store.getUserByToken(token);
    if (!user) {
      return err({ code: 'UNAUTHORIZED', message: '登录态已失效', retryable: false });
    }
    const displayName = body?.displayName == null ? null : String(body.displayName).trim() || null;
    const ageRaw = body?.age;
    const age = ageRaw == null || String(ageRaw).trim() === '' ? null : Number(ageRaw);
    if (age != null && (!Number.isFinite(age) || age < 0 || age > 150)) {
      return err({ code: 'INVALID_PARAMS', message: 'age 无效', retryable: false });
    }
    const gender = body?.gender == null ? null : String(body.gender).trim() || null;
    const occupation = body?.occupation == null ? null : String(body.occupation).trim() || null;
    const needs = body?.needs == null ? null : String(body.needs).trim() || null;
    const customFields = Array.isArray(body?.customFields)
      ? body.customFields
          .map((x: any) => ({ key: String(x?.key ?? '').trim(), value: String(x?.value ?? '').trim() }))
          .filter((x: { key: string; value: string }) => x.key.length > 0)
          .slice(0, 20)
      : [];
    const avatarData = body?.avatarData == null ? null : String(body.avatarData);
    if (avatarData) {
      const maxAvatarBytes = 1024 * 1024; // 1MB
      const avatarBytes = estimateBase64Bytes(avatarData);
      if (avatarBytes > maxAvatarBytes) {
        return err({ code: 'INVALID_PARAMS', message: '图片过大（最大 1MB）', retryable: false });
      }
    }
    await store.updateUserProfile(user.id, { displayName, age, gender, occupation, needs, avatarData, customFields });
    const latest = await store.getUserById(user.id);
    return ok({ user: latest });
  }

  private extractToken(authHeader?: string): string | null {
    const v = String(authHeader ?? '').trim();
    if (!v.toLowerCase().startsWith('bearer ')) return null;
    return v.slice(7).trim() || null;
  }
}
