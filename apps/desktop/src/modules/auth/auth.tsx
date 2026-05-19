import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearAuthToken, login, me, register, setAuthToken, updateProfile } from '../../api';
import { messageFromEnvelope } from '../../utils/user-facing-error';

type User = {
  id: string;
  username: string;
  theme?: 'dark' | 'light';
  displayName?: string | null;
  age?: number | null;
  gender?: string | null;
  occupation?: string | null;
  needs?: string | null;
  avatarData?: string | null;
  customFields?: Array<{ key: string; value: string }>;
};
type AuthCtx = {
  user: User | null;
  loading: boolean;
  /** 登录失败时返回错误文案，成功返回 null（不弹全局错误层） */
  loginByPassword: (username: string, password: string) => Promise<string | null>;
  /** 注册失败时返回错误文案，成功返回 null */
  registerByPassword: (username: string, password: string) => Promise<string | null>;
  updateUserProfile: (payload: {
    displayName?: string | null;
    age?: number | null;
    gender?: string | null;
    occupation?: string | null;
    needs?: string | null;
    avatarData?: string | null;
    customFields?: Array<{ key: string; value: string }>;
  }) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    me()
      .then((resp) => {
        if (resp.ok) setUser(resp.data.user);
        else clearAuthToken();
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      loginByPassword: async (username: string, password: string) => {
        const resp = await login({ username, password });
        if (!resp.ok) {
          return messageFromEnvelope(resp);
        }
        setAuthToken(resp.data.token);
        setUser(resp.data.user);
        return null;
      },
      registerByPassword: async (username: string, password: string) => {
        const resp = await register({ username, password });
        if (!resp.ok) {
          return messageFromEnvelope(resp);
        }
        setAuthToken(resp.data.token);
        setUser(resp.data.user);
        return null;
      },
      updateUserProfile: async (payload) => {
        const resp = await updateProfile(payload);
        if (!resp.ok) {
          return false;
        }
        setUser(resp.data.user);
        return true;
      },
      logout: () => {
        clearAuthToken();
        setUser(null);
      }
    }),
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
