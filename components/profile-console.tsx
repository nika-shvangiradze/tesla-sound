'use client';

import { useMemo } from 'react';
import { hasGpsAccess, PLANS } from '../lib/account-plans';
import { PasswordSettings, useAccount } from './account';
import { useLanguage } from './language';
import SiteHeader from './site-header';

export default function ProfileConsole() {
  const { account, now } = useAccount();
  const { language, t } = useLanguage();
  const date = useMemo(() => new Intl.DateTimeFormat(language === 'ka' ? 'ka-GE' : 'en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Tbilisi',
  }), [language]);
  if (!account) return null;

  const isAdmin = account.role === 'admin';
  const plan = PLANS.find(({ id }) => id === account.plan);
  const active = hasGpsAccess(account, now);
  const status = isAdmin ? 'Administrator access' : active ? 'Active' : plan ? 'Expired' : 'Locked';

  return (
    <div className="shell profile-shell">
      <SiteHeader page="profile" />
      <main className="profile-main">
        <div className="profile-heading">
          <h1>{t('Profile')}</h1>
          <p>{t('Phone number')} <strong dir="ltr">{account.phone}</strong></p>
        </div>
        <div className="profile-grid">
          <section className="panel" aria-labelledby="profile-plan">
            <div className="panel-heading">
              <h2 id="profile-plan">{t('GPS Drive package')}</h2>
              <span className={`badge${active ? ' badge-good' : ''}`}>{t(status)}</span>
            </div>
            <dl className="profile-plan-details">
              <div>
                <dt>{t('Package')}</dt>
                <dd>{t(plan?.label ?? 'No purchased package')}</dd>
              </div>
              <div>
                <dt>{t('Last activation or renewal')}</dt>
                <dd>{account.planActivatedAt == null
                  ? plan ? t('Date unavailable') : '—'
                  : <time dateTime={new Date(account.planActivatedAt).toISOString()}>{date.format(account.planActivatedAt)}</time>}</dd>
              </div>
              <div>
                <dt>{t('Expires (Tbilisi)')}</dt>
                <dd>{account.gpsUntil == null
                  ? '—'
                  : <time dateTime={new Date(account.gpsUntil).toISOString()}>{date.format(account.gpsUntil)}</time>}</dd>
              </div>
            </dl>
          </section>
          <section className="panel" aria-labelledby="profile-password">
            <div className="panel-heading"><h2 id="profile-password">{t('Change password')}</h2></div>
            <div className="profile-password-body"><PasswordSettings minLength={isAdmin ? 12 : 8} /></div>
          </section>
        </div>
      </main>
    </div>
  );
}
