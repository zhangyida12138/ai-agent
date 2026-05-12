import React, { useEffect, useRef, useState } from 'react';
import styles from './build-update-prompt.module.css';

const POLL_MS = 60_000;

function versionJsonUrl(): string {
  const base = import.meta.env.BASE_URL;
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}app-version.json`;
}

async function fetchBuildVersion(): Promise<string | null> {
  try {
    const res = await fetch(versionJsonUrl(), { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (data && typeof data === 'object' && 'v' in data) {
      const v = (data as { v: unknown }).v;
      return v == null ? null : String(v);
    }
    return null;
  } catch {
    return null;
  }
}

export function BuildUpdatePrompt() {
  const [open, setOpen] = useState(false);
  const baselineRef = useRef<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      const v0 = await fetchBuildVersion();
      if (cancelled || v0 == null) return;
      baselineRef.current = v0;
      if (cancelled) return;

      timer = window.setInterval(async () => {
        const next = await fetchBuildVersion();
        if (next == null || baselineRef.current == null) return;
        if (next !== baselineRef.current) {
          if (timer != null) window.clearInterval(timer);
          timer = undefined;
          setOpen(true);
        }
      }, POLL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, []);

  if (!import.meta.env.PROD || !open) return null;

  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true" aria-labelledby="build-update-title">
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div id="build-update-title" className={styles.title}>
          发现新版本
        </div>
        <div className={styles.text}>前端已更新，请刷新页面以使用最新功能并避免异常。</div>
        <div className={styles.actions}>
          <button type="button" className="wx-btn ghost" onClick={() => setOpen(false)}>
            稍后
          </button>
          <button type="button" className="wx-btn primary" onClick={() => window.location.reload()}>
            立即刷新
          </button>
        </div>
      </div>
    </div>
  );
}
