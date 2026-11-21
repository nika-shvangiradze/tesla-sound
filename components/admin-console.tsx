'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { accountRequest, useAccount } from './account';
import SiteHeader from './site-header';
import { useLanguage } from './language';
import { PLANS, type AccountView, type PlanId } from '../lib/account-plans';

const PAGE_SIZE = 20;
type AccountChange = { action: 'grant'; plan: PlanId } | { action: 'revoke' | 'delete' };
export default function AdminConsole() {
  const { account } = useAccount();
  const { language, t, message } = useLanguage();
  const formatDate = useMemo(() => new Intl.DateTimeFormat(language === 'ka' ? 'ka-GE' : 'en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Tbilisi',
  }), [language]);
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ phone: string; createdAt: number; action: 'revoke' | 'delete' } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ message: string; phone: string } | null>(null);
  const [now, setNow] = useState(0);
  const pendingGrant = useRef<{ phone: string; createdAt: number; plan: PlanId; id: string } | null>(null);
  const requestId = useRef(0);
  const canManage = account?.role === 'admin';

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await accountRequest<{ accounts: AccountView[]; total: number; serverTime: number }>(
        { action: 'list', offset, search },
      );
      if (requestId.current !== id) return;
      if (offset >= result.total && offset > 0) {
        setOffset(Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1) * PAGE_SIZE);
        return;
      }
      setAccounts(result.accounts);
      setTotal(result.total);
      setNow(result.serverTime);
    } catch (failure) {
      if (requestId.current === id) setError(failure instanceof Error ? failure.message : 'Could not load accounts.');
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [offset, search]);

  useEffect(() => {
    if (canManage) void load();
    return () => { requestId.current++; };
  }, [canManage, load]);

  async function change(user: AccountView, operation: AccountChange) {
    if (busyPhone) return;
    const { phone, createdAt } = user;
    setBusyPhone(phone);
    setNotice(null);
    setError('');
    try {
      const payload = { action: operation.action, phone, createdAt };
      if (operation.action === 'grant') {
        const { plan } = operation;
        const previous = pendingGrant.current;
        const grant = previous?.phone === phone && previous.createdAt === createdAt && previous.plan === plan
          ? previous : { phone, createdAt, plan, id: crypto.randomUUID() };
        pendingGrant.current = grant;
        await accountRequest({ ...payload, plan, id: grant.id });
      } else {
        await accountRequest(payload);
      }
      pendingGrant.current = null;
      setConfirmation(null);
      const message = operation.action === 'grant' ? 'GPS Drive access updated for {phone}'
        : operation.action === 'revoke' ? 'GPS Drive turned off for {phone}' : 'Account deleted for {phone}';
      setNotice({ message, phone });
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update the account.');
    } finally {
      setBusyPhone(null);
    }
  }

  if (!canManage) return (
    <div className="shell admin-shell">
      <SiteHeader page="admin" />
      <main className="account-denied"><h1>{t('Administrator access required')}</h1></main>
    </div>
  );

  return (
    <div className="shell admin-shell">
      <SiteHeader page="admin" />
      <main>
        <div className="engine-intro">
          <div><h1>{t('Admin panel')}</h1><p>{t('Manage user accounts and GPS Drive access')}</p></div>
        </div>
        <section className="panel admin-panel" aria-labelledby="admin-users">
          <div className="panel-heading"><h2 id="admin-users">{t('User accounts')}</h2><span>{t('{count} found', { count: total })}</span></div>
          <form className="admin-search" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const next = String(new FormData(event.currentTarget).get('phone') ?? '').replace(/\D/g, '');
            if (next === search && offset === 0) { void load(); return; }
            setConfirmation(null);
            setSearch(next);
            setOffset(0);
          }}>
            <label htmlFor="account-search">{t('Phone number')}</label>
            <input id="account-search" name="phone" type="tel" placeholder={t('Search phone number')} maxLength={35} />
            <button className="button" disabled={loading || !!busyPhone}>{t('Search')}</button>
          </form>
          {error && <p className="account-error admin-message" role="alert">{message(error)}</p>}
          {notice && <p className="admin-message" role="status">{t(notice.message, { phone: notice.phone })}</p>}
          {loading && <p className="admin-message" role="status">{t('Loading accounts…')}</p>}
          {!loading && accounts.length === 0 && <p className="admin-message">{t('No users found')}</p>}
          {accounts.length > 0 && (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead><tr><th>{t('Phone')}</th><th>{t('GPS Drive')}</th><th>{t('Expires (Tbilisi)')}</th><th>{t('Manage')}</th></tr></thead>
                <tbody>{accounts.map((user) => {
                  const active = (user.gpsUntil ?? 0) > now;
                  const confirming = confirmation?.phone === user.phone && confirmation.createdAt === user.createdAt
                    ? confirmation.action : null;
                  return (
                    <tr key={user.phone}>
                      <th scope="row">{user.phone}</th>
                      <td><span className={`badge ${active ? 'badge-good' : ''}`}>{t(active ? 'Active' : user.gpsUntil ? 'Expired' : 'Locked')}</span></td>
                      <td className="admin-expiry"><span>{t('Expires')} · </span>{user.gpsUntil ? formatDate.format(user.gpsUntil) : '—'}</td>
                      <td>
                        <div className="admin-row-actions">
                          <form onSubmit={(event) => {
                            event.preventDefault();
                            const value = new FormData(event.currentTarget).get('plan');
                            const plan = PLANS.find((item) => item.id === value);
                            if (plan) void change(user, { action: 'grant', plan: plan.id });
                          }}>
                            <fieldset className="admin-plans" disabled={!!busyPhone || loading || !!confirming}>
                              <legend className="sr-only">{t('Plan for {phone}', { phone: user.phone })}</legend>
                              {PLANS.map((item) => {
                                const id = `admin-plan-${user.phone}-${item.id}`;
                                return <div key={item.id}>
                                  <input className="sr-only voice-radio" name="plan" id={id} type="radio"
                                    value={item.id} defaultChecked={item.id === 'month'} />
                                  <label className="voice-card" htmlFor={id}>
                                    <span>{t(item.label)}</span><strong>₾{item.price}</strong>
                                  </label>
                                </div>;
                              })}
                            </fieldset>
                            <button className="button primary" disabled={!!busyPhone || loading || !!confirming}>{t(active ? 'Extend' : 'Activate')}</button>
                          </form>
                          {confirming ? (
                            <div className="admin-confirm">
                              <p>{t(confirming === 'delete' ? 'Delete {phone} and end all their sessions?' : 'Turn off GPS Drive for {phone}?', { phone: user.phone })}</p>
                              <button className="button account-danger" disabled={!!busyPhone || loading}
                                onClick={() => void change(user, { action: confirming })}>
                                {t(confirming === 'delete' ? 'Confirm delete' : 'Confirm turn off')}
                              </button>
                              <button className="button" disabled={!!busyPhone} onClick={() => setConfirmation(null)}>{t('Cancel')}</button>
                            </div>
                          ) : (
                            <div className="admin-secondary-actions">
                              {active && <button className="button" disabled={!!busyPhone || loading}
                                onClick={() => setConfirmation({ phone: user.phone, createdAt: user.createdAt, action: 'revoke' })}>{t('Turn off GPS Drive')}</button>}
                              <button className="button account-danger" disabled={!!busyPhone || loading}
                                onClick={() => setConfirmation({ phone: user.phone, createdAt: user.createdAt, action: 'delete' })}>{t('Delete user')}</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
          {total > PAGE_SIZE && <div className="admin-pagination">
            <button className="button" disabled={loading || !!busyPhone || offset === 0} onClick={() => setOffset(offset - PAGE_SIZE)}>{t('Previous')}</button>
            <button className="button" disabled={loading || !!busyPhone || offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>{t('Next')}</button>
          </div>}
        </section>
      </main>
    </div>
  );
}
