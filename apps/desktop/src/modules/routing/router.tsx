import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type RouterCtx = {
  path: string;
  navigate: (to: string, replace?: boolean) => void;
};

const RouterContext = createContext<RouterCtx | null>(null);

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState<string>(window.location.pathname || '/');

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const value = useMemo<RouterCtx>(
    () => ({
      path,
      navigate: (to: string, replace = false) => {
        if (to === path) return;
        if (replace) window.history.replaceState(null, '', to);
        else window.history.pushState(null, '', to);
        setPath(to);
      }
    }),
    [path]
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within RouterProvider');
  return ctx;
}
