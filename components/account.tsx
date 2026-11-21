'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { hasGpsAccess, LOCAL_PHONE_PATTERN, SIGN_IN_PHONE_PATTERN, SUPPORT_PHONE } from '../lib/account-plans';
import type { AccountView } from '../lib/account-plans';
import { LanguageSwitch, useLanguage } from './language';

const ENDPOINT = '/.netlify/functions/account';
type SessionResult = { account: AccountView | null; serverTime: number };

export async function accountRequest<T>(body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(ENDPOINT, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error ?? 'Account service unavailable. Try again.');
  return result as T;
}

type AccountContextValue = {
  account: AccountView | null;
  ready: boolean;
  error: string;
  gpsEnabled: boolean;
  refresh: () => Promise<SessionResult>;
  submit: (data: Record<string, unknown>) => Promise<SessionResult>;
};
const SessionContext = createContext<AccountContextValue | null>(null);

export function useAccount() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('Account provider is missing.');
  return context;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionResult | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(0);
  const generation = useRef(0);
  const mutation = useRef<Promise<SessionResult> | null>(null);

  const fetchSession = useCallback(async (body?: Record<string, unknown>) => {
    const id = ++generation.current;
    try {
      const result = await accountRequest<SessionResult>(body);
      if (id === generation.current) {
        const received = Date.now();
        setClockOffset(result.serverTime - received);
        setNow(result.serverTime);
        setSession(result);
        setConnected(true);
        setError('');
      }
      return result;
    } catch (failure) {
      if (!body && id === generation.current) {
        setConnected(false);
        setError(failure instanceof Error ? failure.message : 'Account service unavailable.');
      }
      throw failure;
    } finally {
      if (id === generation.current) setReady(true);
    }
  }, []);

  const refresh = useCallback(() => mutation.current ?? fetchSession(), [fetchSession]);
  const submit = useCallback((body: Record<string, unknown>) => {
    if (mutation.current) return Promise.reject(new Error('An account request is already in progress.'));
    const request = fetchSession(body).finally(() => { mutation.current = null; });
    mutation.current = request;
    return request;
  }, [fetchSession]);
  const account = session?.account ?? null;
  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);
  useEffect(() => {
    if (!account) return;
    const refreshSession = () => {
      if (!document.hidden) void refresh().catch(() => {});
    };
    const poll = window.setInterval(refreshSession, 30_000);
    document.addEventListener('visibilitychange', refreshSession);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', refreshSession);
    };
  }, [account?.phone, refresh]);
  useEffect(() => {
    const expiry = account?.gpsUntil;
    if (!expiry || expiry <= now) return;
    const timer = window.setTimeout(() => setNow(Date.now() + clockOffset),
      Math.min(2_147_000_000, Math.max(1, expiry - (Date.now() + clockOffset) + 1)));
    return () => window.clearTimeout(timer);
  }, [account?.gpsUntil, clockOffset, now]);

  return (
    <SessionContext.Provider value={{
      account, ready, error, gpsEnabled: connected && hasGpsAccess(account, now),
      refresh, submit,
    }}>{children}</SessionContext.Provider>
  );
}

export function AccountGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t, message } = useLanguage();
  const { ready, account, error, refresh } = useAccount();
  if (pathname?.replace(/\/$/, '') === '/setup') return children;
  if (!ready) return <div className="account-shell"><p role="status">{t('Checking session…')}</p></div>;
  if (!account && error) return (
    <div className="account-shell">
      <LanguageSwitch />
      <p role="alert">{message(error)}</p>
      <button className="button" onClick={() => void refresh().catch(() => {})}>{t('Try again')}</button>
    </div>
  );
  return account ? children : <AccountForm />;
}

export function AccountForm({ setup = false }: { setup?: boolean }) {
  const { submit } = useAccount();
  const { t, message } = useLanguage();
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState(setup ? SUPPORT_PHONE.slice(4) : '');
  const confirmation = setup || register;
  const title = setup ? 'Administrator setup' : register ? 'Create an account' : 'Sign in';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    if (confirmation && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await submit({
        action: setup ? 'setup' : register ? 'register' : 'login',
        phone: form.get('phone'), password, confirmPassword,
        ...(setup ? { setupToken: form.get('setupToken') } : {}),
      });
      if (setup) router.replace('/');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not complete this request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-shell">
      <div className="account-card panel">
        <div className="account-card-header">
          <div className="wordmark"><span className="brand-mark" aria-hidden="true"><i /></span>Volt<span>Sound</span></div>
          <LanguageSwitch />
        </div>
        <h1>{t(title)}</h1>
        {!setup && <div className="account-tabs" aria-label={t('Account action')} role="group">
          <button className="button" aria-pressed={!register} disabled={busy} onClick={() => { setRegister(false); setError(''); }}>{t('Sign in')}</button>
          <button className="button" aria-pressed={register} disabled={busy} onClick={() => { setRegister(true); setError(''); }}>{t('Register')}</button>
        </div>}
        <form className="account-form" onSubmit={save}>
          <label>{t('Phone number')}<input name="phone" type="tel" inputMode="tel" autoComplete="username"
            placeholder="555555555" aria-describedby="phone-format" pattern={confirmation ? LOCAL_PHONE_PATTERN : SIGN_IN_PHONE_PATTERN}
            required value={phone} readOnly={setup} onChange={(event) => setPhone(event.target.value.replace(/\s/g, ''))} />
            <span id="phone-format">{t('Enter 9 digits without spaces, e.g. 555555555')}</span></label>
          <label>{t('Password')}<input name="password" type="password" required maxLength={128}
            minLength={setup ? 12 : register ? 8 : 1} autoComplete={confirmation ? 'new-password' : 'current-password'} /></label>
          {confirmation && <label>{t('Confirm password')}<input name="confirmPassword" type="password" required
            maxLength={128} autoComplete="new-password" /></label>}
          {setup && <label>{t('Private setup code')}<input name="setupToken" type="password" required maxLength={128} autoComplete="off" /></label>}
          {error && <p className="account-error" role="alert">{message(error)}</p>}
          <button className="button primary" disabled={busy}>{t(busy ? 'Please wait…' : title)}</button>
        </form>
        {setup && <Link className="engine-nav" href="/">{t('Back to sign in')}</Link>}
      </div>
    </main>
  );
}

function PasswordSettings({ minLength }: { minLength: number }) {
  const { submit } = useAccount();
  const { t, message } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const currentPassword = fields.get('currentPassword');
    const password = fields.get('password');
    const confirmPassword = fields.get('confirmPassword');
    setError('');
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await submit({ action: 'change-password', currentPassword, password, confirmPassword });
      form.current?.reset();
      setChanged(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="button" type="button" onClick={() => {
        form.current?.reset();
        setError('');
        setChanged(false);
        dialog.current?.showModal();
      }}>{t('Change password')}</button>
      <dialog ref={dialog} className="password-dialog panel" aria-label={t('Change password')}
        onClose={() => form.current?.reset()}
        onCancel={(event) => { if (busy) event.preventDefault(); }}>
        <div className="panel-heading">
          <h2>{t('Change password')}</h2>
          <button className="button" type="button" disabled={busy} onClick={() => dialog.current?.close()}>{t('Close')}</button>
        </div>
        <div className="password-body">
          <form className="account-form" ref={form} onSubmit={save} hidden={changed}>
            <label>{t('Current password')}<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} /></label>
            <label>{t('New password')}<input name="password" type="password" autoComplete="new-password" required minLength={minLength} maxLength={128} /></label>
            <label>{t('Confirm new password')}<input name="confirmPassword" type="password" autoComplete="new-password" required maxLength={128} /></label>
            {error && <p className="account-error" role="alert">{message(error)}</p>}
            <button className="button primary" disabled={busy}>{t(busy ? 'Saving…' : 'Save password')}</button>
          </form>
          {changed && <p role="status">{t('Password changed. Your other sessions have been signed out')}</p>}
        </div>
      </dialog>
    </>
  );
}

export function AccountMenu({ showAdmin }: { showAdmin: boolean }) {
  const { account, submit } = useAccount();
  const { t, message } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!account) return null;
  return (
    <>
      {showAdmin && account.role === 'admin' && <Link className="button site-section" href="/admin/">{t('Admin')}</Link>}
      <PasswordSettings minLength={account.role === 'admin' ? 12 : 8} />
      <button className="button" disabled={busy} onClick={async () => {
        setBusy(true);
        setError('');
        try { await submit({ action: 'logout' }); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Sign out failed.'); }
        finally { setBusy(false); }
      }}>{t('Sign out')}</button>
      {error && <span className="account-error" role="alert">{message(error)}</span>}
    </>
  );
}
