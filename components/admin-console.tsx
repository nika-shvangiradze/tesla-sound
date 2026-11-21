'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AccountMenu, accountRequest, useAccount } from './account';
import { PLANS, type AccountView, type PlanId } from '../lib/account-plans';

const PAGE_SIZE = 20;
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
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(0);
  const pendingGrant = useRef<{ phone: string; plan: PlanId; id: string } | null>(null);
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

  async function change(phone: string, plan?: PlanId) {
    if (busyPhone) return;
    setBusyPhone(phone);
    setNotice('');
    setError('');
    try {
      const previous = pendingGrant.current;
      if (plan && (previous?.phone !== phone || previous.plan !== plan)) {
        pendingGrant.current = { phone, plan, id: crypto.randomUUID() };
      }
      await accountRequest({ action: plan ? 'grant' : 'revoke', phone, plan, id: pendingGrant.current?.id });
      pendingGrant.current = null;
      setPendingRevoke(null);
      setNotice(plan ? `GPS Drive access updated for ${phone}.` : `GPS Drive revoked for ${phone}.`);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update access.');
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
          <div><h1>Admin panel</h1><p>Find an account and manage its GPS Drive access.</p></div>
        </div>
        <section className="panel admin-panel" aria-labelledby="admin-users">
          <div className="panel-heading"><h2 id="admin-users">User accounts</h2><span>{total} found</span></div>
          <form className="admin-search" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const next = String(new FormData(event.currentTarget).get('phone') ?? '').replace(/\D/g, '');
            if (next === search && offset === 0) { void load(); return; }
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
                            if (plan) void change(user.phone, plan.id);
                          }}>
                            <fieldset className="admin-plans" disabled={!!busyPhone || loading}>
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
                            <button className="button primary" disabled={!!busyPhone || loading}>{active ? 'Extend' : 'Activate'}</button>
                          </form>
                          {user.gpsUntil && (pendingRevoke === user.phone ? (
                            <>
                              <button className="button" disabled={!!busyPhone} onClick={() => void change(user.phone)}>Confirm revoke</button>
                              <button className="button" disabled={!!busyPhone} onClick={() => setPendingRevoke(null)}>Cancel</button>
                            </>
                          ) : <button className="button" disabled={!!busyPhone || loading} onClick={() => setPendingRevoke(user.phone)}>Revoke</button>)}
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
