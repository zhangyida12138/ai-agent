import React, { useState } from 'react';
import { useAuth } from '../modules/auth/auth';
import styles from './auth-page.module.css';

export function AuthPage() {
  const { loginByPassword, registerByPassword, error, clearError } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <h1 className={styles.title}>AI 助手</h1>
        <p className={styles.subtitle}>登录后访问聊天与知识库</p>
        <input className="wx-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" disabled={loading} />
        <input className="wx-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码（至少6位）" type="password" disabled={loading} />
        <button
          className="wx-btn primary"
          onClick={async () => {
            if (!username.trim() || !password) return;
            setLoading(true);
            clearError();
            if (mode === 'login') await loginByPassword(username.trim(), password);
            else await registerByPassword(username.trim(), password);
            setLoading(false);
          }}
          disabled={loading}
        >
          {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
        </button>
        <button className="wx-btn ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} disabled={loading}>
          {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
        </button>
      </div>
      {error ? (
        <div className={styles.errorOverlay} onClick={clearError}>
          <div className={styles.errorDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.errorTitle}>错误</div>
            <div className={styles.errorText}>{error}</div>
            <div className={styles.errorActions}>
              <button className="wx-btn primary" onClick={clearError}>我知道了</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
