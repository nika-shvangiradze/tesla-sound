'use client';

import Link from 'next/link';
import { AccountMenu, useAccount } from './account';
import { LanguageSwitch, useLanguage } from './language';

function Wordmark() {
  return <Link className="wordmark" href="/"><span className="brand-mark" aria-hidden="true"><i /></span>Volt<span>Sound</span></Link>;
}

export default function SiteHeader({ page }: { page: 'engine' | 'diagnostic' | 'admin' }) {
  const { t } = useLanguage();
  const { account } = useAccount();
  const showAdmin = page !== 'admin' && account?.role === 'admin';
  return (
    <header className="topbar site-header">
      <Wordmark />
      <LanguageSwitch />
      <nav className={`site-nav${showAdmin ? ' site-nav-admin' : ''}`} aria-label={t('Main navigation')}>
        {page === 'engine'
          ? <Link className="button site-section" href="/diagnostic/">{t('GPS Diagnostic')}</Link>
          : <Link className="button site-section" href="/">{t('V8 GPS Edition')}</Link>}
        <AccountMenu showAdmin={showAdmin} />
      </nav>
    </header>
  );
}
