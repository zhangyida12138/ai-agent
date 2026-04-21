import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './modules/auth/auth';
import { RouterProvider, useRouter } from './modules/routing/router';
import { AuthPage } from './pages/auth-page';
import { AppLayout } from './pages/app-layout';

function AppRoutes() {
  const { user, loading } = useAuth();
  const { path, navigate } = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user && path !== '/auth') navigate('/auth', true);
    if (user && path === '/auth') navigate('/chat', true);
    if (user && path !== '/chat' && path !== '/knowledge') navigate('/chat', true);
  }, [loading, navigate, path, user]);

  if (loading) return <div className="app-shell"><div style={{ margin: 'auto' }}>正在检查登录态...</div></div>;
  if (!user) return <AuthPage />;
  return <AppLayout />;
}

export function AppRoot() {
  return (
    <RouterProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </RouterProvider>
  );
}
