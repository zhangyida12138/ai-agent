import React, { useEffect, useState } from 'react';
import { BRAND_EN, BRAND_SLOGAN_EN, BRAND_ZH_SPACE } from '../config/brand';
import { useAuth } from '../modules/auth/auth';
import { useRouter } from '../modules/routing/router';
import styles from './auth-page.module.css';

export function LoginPage() {
  const { loginByPassword } = useAuth();
  const { navigate } = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(''), 4000);
    return () => window.clearTimeout(t);
  }, [hint]);

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.brandRow}>
          <img className={styles.brandMark} src="/icon.svg" alt="" width={56} height={56} />
          <div className={styles.brandNames}>
            <span className={styles.brandEn}>{BRAND_EN}</span>
            <span className={styles.brandSep} aria-hidden>
              ·
            </span>
            <span className={styles.brandZh}>{BRAND_ZH_SPACE}</span>
          </div>
        </div>
        <p className={styles.sloganEn}>{BRAND_SLOGAN_EN}</p>
        <p className={styles.subtitle}>登录后使用本地对话与知识库</p>
        <input
          className="wx-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="用户名"
          autoComplete="username"
          disabled={loading}
        />
        <input
          className="wx-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          type="password"
          autoComplete="current-password"
          disabled={loading}
        />
        {hint ? (
          <div className={styles.hint} role="status" aria-live="polite">
            {hint}
          </div>
        ) : null}
        <button
          className="wx-btn primary"
          type="button"
          onClick={async () => {
            if (!username.trim() || !password) return;
            setLoading(true);
            setHint('');
            const err = await loginByPassword(username.trim(), password);
            setLoading(false);
            if (err) setHint(err);
          }}
          disabled={loading}
        >
          {loading ? '处理中...' : '登录'}
        </button>
        <div className={styles.authLinkRow}>
          <button type="button" className={styles.authLink} onClick={() => navigate('/auth/register')} disabled={loading}>
            没有账号？去注册
          </button>
        </div>
      </div>
    </div>
  );
}
