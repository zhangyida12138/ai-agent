import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearAuthToken, login, me, register, setAuthToken } from '../../api';

type User = { id: string; username: string };
type AuthCtx = {
  user: User | null;
  loading: boolean;
  error: string | null;
  loginByPassword: (username: string, password: string) => Promise<boolean>;
  registerByPassword: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      error,
      loginByPassword: async (username: string, password: string) => {
        setError(null);
        const resp = await login({ username, password });
        if (!resp.ok) {
          setError(`${resp.code}: ${resp.message}`);
          return false;
        }
        setAuthToken(resp.data.token);
        setUser(resp.data.user);
        return true;
      },
      registerByPassword: async (username: string, password: string) => {
        setError(null);
        const resp = await register({ username, password });
        if (!resp.ok) {
          setError(`${resp.code}: ${resp.message}`);
          return false;
        }
        setAuthToken(resp.data.token);
        setUser(resp.data.user);
        return true;
      },
      logout: () => {
        clearAuthToken();
        setUser(null);
      },
      clearError: () => setError(null)
    }),
    [error, loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
