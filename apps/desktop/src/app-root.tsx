import React, { useEffect } from 'react';
import { BuildUpdatePrompt } from './components/build-update-prompt';
import { AuthProvider, useAuth } from './modules/auth/auth';
import { RouterProvider, useRouter } from './modules/routing/router';
import { AppLayout } from './pages/app-layout';
import { LoginPage } from './pages/login-page';
import { RegisterPage } from './pages/register-page';

function isAuthPath(p: string) {
  return p === '/auth' || p === '/auth/login' || p === '/auth/register';
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const { path, navigate } = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      if (path === '/auth') {
        navigate('/auth/login', true);
        return;
      }
      if (!isAuthPath(path)) navigate('/auth/login', true);
      return;
    }
    if (user && isAuthPath(path)) {
      navigate('/chat', true);
      return;
    }
    if (user && path !== '/chat' && path !== '/knowledge' && path !== '/settings') navigate('/chat', true);
  }, [loading, navigate, path, user]);

  if (loading) return <div className="app-shell"><div style={{ margin: 'auto' }}>正在检查登录态...</div></div>;
  if (!user) {
    if (path === '/auth/register') return <RegisterPage />;
    return <LoginPage />;
  }
  return <AppLayout />;
}

export function AppRoot() {
  return (
    <RouterProvider>
      {import.meta.env.PROD ? <BuildUpdatePrompt /> : null}
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </RouterProvider>
  );
}
