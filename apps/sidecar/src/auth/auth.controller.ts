import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ChatHistoryStore } from '../db/chat-history-store';

function ok<T>(data: T) {
  return { ok: true as const, code: 'SUCCESS', data };
}

function err(params: { code: string; message: string; retryable: boolean; nextAction?: string }) {
  return { ok: false as const, ...params };
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

  private extractToken(authHeader?: string): string | null {
    const v = String(authHeader ?? '').trim();
    if (!v.toLowerCase().startsWith('bearer ')) return null;
    return v.slice(7).trim() || null;
  }
}
