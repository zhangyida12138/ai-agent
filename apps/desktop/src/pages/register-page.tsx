import React from 'react';
import { BRAND_EN, BRAND_SLOGAN_EN, BRAND_ZH_SPACE } from '../config/brand';
import { REGISTRATION_DISABLED_HINT } from '../config/auth';
import { useRouter } from '../modules/routing/router';
import styles from './auth-page.module.css';

export function RegisterPage() {
  const { navigate } = useRouter();

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
        <p className={styles.subtitle}>{REGISTRATION_DISABLED_HINT}</p>
        <button type="button" className="wx-btn primary" onClick={() => navigate('/auth/login')}>
          返回登录
        </button>
      </div>
    </div>
  );
}
