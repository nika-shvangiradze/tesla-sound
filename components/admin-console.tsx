'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AccountMenu, accountRequest, useAccount } from './account';
import { PLANS, type AccountView, type PlanId } from '../lib/account-plans';

const PAGE_SIZE = 20;
type AccountChange = { action: 'grant'; plan: PlanId } | { action: 'revoke' | 'delete' };
const formatDate = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tbilisi',
});

export default function AdminConsole() {
  const { account } = useAccount();
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ phone: string; createdAt: number; action: 'revoke' | 'delete' } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
    setNotice('');
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
      const message = operation.action === 'grant' ? 'GPS Drive access updated for'
        : operation.action === 'revoke' ? 'GPS Drive turned off for' : 'Account deleted for';
      setNotice(`${message} ${phone}.`);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update the account.');
    } finally {
      setBusyPhone(null);
    }
  }

  if (!canManage) return <main className="shell account-denied"><h1>Administrator access required</h1><Link className="engine-nav" href="/">VoltRoar</Link></main>;

  return (
    <div className="shell admin-shell">
      <header className="topbar">
        <Link className="wordmark" href="/"><span className="brand-mark" aria-hidden="true"><i /></span>Volt<span>Sound</span></Link>
        <AccountMenu />
      </header>
      <main>
        <div className="engine-intro">
          <div><h1>Admin panel</h1><p>Manage user accounts and GPS Drive access.</p></div>
        </div>
        <section className="panel admin-panel" aria-labelledby="admin-users">
          <div className="panel-heading"><h2 id="admin-users">User accounts</h2><span>{total} found</span></div>
          <form className="admin-search" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const next = String(new FormData(event.currentTarget).get('phone') ?? '').replace(/\D/g, '');
            if (next === search && offset === 0) { void load(); return; }
            setConfirmation(null);
            setSearch(next);
            setOffset(0);
          }}>
            <label htmlFor="account-search">Phone number</label>
            <input id="account-search" name="phone" type="tel" placeholder="Search phone number" maxLength={35} />
            <button className="button" disabled={loading || !!busyPhone}>Search</button>
          </form>
          {error && <p className="account-error admin-message" role="alert">{error}</p>}
          {notice && <p className="admin-message" role="status">{notice}</p>}
          {loading && <p className="admin-message" role="status">Loading accounts…</p>}
          {!loading && accounts.length === 0 && <p className="admin-message">No users found.</p>}
          {accounts.length > 0 && (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead><tr><th>Phone</th><th>GPS Drive</th><th>Expires (Tbilisi)</th><th>Manage</th></tr></thead>
                <tbody>{accounts.map((user) => {
                  const active = (user.gpsUntil ?? 0) > now;
                  const confirming = confirmation?.phone === user.phone && confirmation.createdAt === user.createdAt
                    ? confirmation.action : null;
                  return (
                    <tr key={user.phone}>
                      <th scope="row">{user.phone}</th>
                      <td><span className={`badge ${active ? 'badge-good' : ''}`}>{active ? 'Active' : user.gpsUntil ? 'Expired' : 'Locked'}</span></td>
                      <td className="admin-expiry"><span>Expires · </span>{user.gpsUntil ? formatDate.format(user.gpsUntil) : '—'}</td>
                      <td>
                        <div className="admin-row-actions">
                          <form onSubmit={(event) => {
                            event.preventDefault();
                            const value = new FormData(event.currentTarget).get('plan');
                            const plan = PLANS.find((item) => item.id === value);
                            if (plan) void change(user, { action: 'grant', plan: plan.id });
                          }}>
                            <fieldset className="admin-plans" disabled={!!busyPhone || loading || !!confirming}>
                              <legend className="sr-only">Plan for {user.phone}</legend>
                              {PLANS.map((item) => {
                                const id = `admin-plan-${user.phone}-${item.id}`;
                                return <div key={item.id}>
                                  <input className="sr-only voice-radio" name="plan" id={id} type="radio"
                                    value={item.id} defaultChecked={item.id === 'month'} />
                                  <label className="voice-card" htmlFor={id}>
                                    <span>{item.label}</span><strong>₾{item.price}</strong>
                                  </label>
                                </div>;
                              })}
                            </fieldset>
                            <button className="button primary" disabled={!!busyPhone || loading || !!confirming}>{active ? 'Extend' : 'Activate'}</button>
                          </form>
                          {confirming ? (
                            <div className="admin-confirm">
                              <p>{confirming === 'delete' ? `Delete ${user.phone} and end all their sessions?` : `Turn off GPS Drive for ${user.phone}?`}</p>
                              <button className="button account-danger" disabled={!!busyPhone || loading}
                                onClick={() => void change(user, { action: confirming })}>
                                {confirming === 'delete' ? 'Confirm delete' : 'Confirm turn off'}
                              </button>
                              <button className="button" disabled={!!busyPhone} onClick={() => setConfirmation(null)}>Cancel</button>
                            </div>
                          ) : (
                            <>
                              {active && <button className="button" disabled={!!busyPhone || loading}
                                onClick={() => setConfirmation({ phone: user.phone, createdAt: user.createdAt, action: 'revoke' })}>Turn off GPS Drive</button>}
                              <button className="button account-danger" disabled={!!busyPhone || loading}
                                onClick={() => setConfirmation({ phone: user.phone, createdAt: user.createdAt, action: 'delete' })}>Delete user</button>
                            </>
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
            <button className="button" disabled={loading || !!busyPhone || offset === 0} onClick={() => setOffset(offset - PAGE_SIZE)}>Previous</button>
            <button className="button" disabled={loading || !!busyPhone || offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button>
          </div>}
        </section>
      </main>
    </div>
  );
}
