import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { addMonths, hasGpsAccess, PLANS, SUPPORT_PHONE } from '../lib/account-plans.ts';
import type { AccountView } from '../lib/account-plans.ts';
import { handleAccount } from '../server/accounts.ts';
import type { AccountStore } from '../server/accounts.ts';

export function memoryStore(): AccountStore {
  const entries = new Map<string, { data: unknown; etag: string }>();
  let version = 0;
  return {
    async read<T>(key: string) {
      const entry = entries.get(key);
      return entry ? { etag: entry.etag, data: structuredClone(entry.data) as T } : null;
    },
    async write(key, data, options) {
      const entry = entries.get(key);
      if ('onlyIfNew' in options ? !!entry : entry?.etag !== options.onlyIfMatch) return false;
      entries.set(key, { data: structuredClone(data), etag: String(++version) });
      return true;
    },
    async list(prefix) { return [...entries.keys()].filter((key) => key.startsWith(prefix)); },
  };
}

test('account and administrator flow covers password changes, GPS access, and deletion', async () => {
  const store = memoryStore();
  const origin = 'https://voltroar.example';
  const setupToken = 'local-only-random-shaped-test-token-do-not-use';
  const digest = createHash('sha256').update(setupToken).digest('hex');
  const phone = '+995555123456';
  const localPhone = '555123456';
  const adminPhone = SUPPORT_PHONE.slice(4);
  const password = 'test-password-41';
  function issue(body?: object, cookie = '', from = origin) {
    return handleAccount(new Request(origin + '/.netlify/functions/account', {
      method: body ? 'POST' : 'GET',
      ...(body ? { body: JSON.stringify(body) } : {}),
      headers: { 'content-type': 'application/json', origin: from, cookie },
    }), store, '127.0.0.1', digest);
  }
  function sessionFrom(response: Response) { return response.headers.get('set-cookie')?.split(';')[0] ?? ''; }

  assert.equal((await (await issue()).json()).account, null);
  assert.equal((await issue({ action: 'register', phone: adminPhone, password, confirmPassword: password })).status, 400);
  assert.equal((await issue({ action: 'register', phone: '555 123 456', password, confirmPassword: password })).status, 400);
  assert.equal((await issue({ action: 'register', phone, password, confirmPassword: password })).status, 400);
  assert.equal((await issue({ action: 'setup', phone: adminPhone, password, confirmPassword: password, setupToken: 'wrong' })).status, 403);
  const user = await issue({ action: 'register', phone: localPhone, password, confirmPassword: password });
  assert.equal(user.status, 200);
  assert.match(user.headers.get('set-cookie') ?? '', /__Host-voltroar=.*; HttpOnly; SameSite=Lax; Secure/);
  const userCookie = sessionFrom(user);
  const account = (await user.json()).account as AccountView;
  assert.equal(account.phone, phone);
  assert.equal(hasGpsAccess(account), false);
  assert.equal(account.planActivatedAt, null);
  assert.deepEqual(Object.keys(account).sort(), ['createdAt', 'gpsUntil', 'phone', 'plan', 'planActivatedAt', 'role']);
  assert.equal((await issue({ action: 'list' }, userCookie)).status, 403);
  assert.equal((await issue({ action: 'list' }, '', 'https://foreign.example')).status, 403);
  assert.equal((await issue({ action: 'register', phone: localPhone, password, confirmPassword: password })).status, 409);

  const admin = await issue({ action: 'setup', phone: adminPhone, password, confirmPassword: password, setupToken });
  assert.equal(admin.status, 200);
  assert.equal(hasGpsAccess((await admin.json()).account), true);
  const adminCookie = sessionFrom(admin);
  assert.equal((await issue({ action: 'setup', phone: adminPhone, password, confirmPassword: password, setupToken })).status, 409);
  const list = await (await issue({ action: 'list', search: '555123456' }, adminCookie)).json();
  assert.deepEqual(list.accounts, [account]);

  const userKey = 'user/' + phone;
  const stored = await store.read<Record<string, unknown>>(userKey);
  assert.ok(stored);
  delete stored.data.planActivatedAt;
  const legacyExpiry = addMonths(Date.now(), 1);
  await store.write(userKey, { ...stored.data, plan: 'month', gpsUntil: legacyExpiry }, { onlyIfMatch: stored.etag });
  const legacy = (await (await issue(undefined, userCookie)).json()).account;
  assert.equal(legacy.plan, 'month');
  assert.equal(legacy.planActivatedAt, null);
  assert.equal(legacy.gpsUntil, legacyExpiry);

  const grant = { action: 'grant', phone, plan: 'month', id: 'test-unique-grant-0001' };
  const [first, repeated] = await Promise.all([issue(grant, adminCookie), issue(grant, adminCookie)]);
  const [one, two] = await Promise.all([first.json(), repeated.json()]);
  assert.equal(one.account.gpsUntil, two.account.gpsUntil);
  assert.equal(one.account.gpsUntil, addMonths(legacyExpiry, 1));
  assert.ok(one.account.planActivatedAt >= account.createdAt);
  assert.equal(one.account.planActivatedAt, two.account.planActivatedAt);
  const extended = await (await issue({ ...grant, plan: 'quarter', id: 'test-unique-grant-0002' }, adminCookie)).json();
  assert.equal(extended.account.gpsUntil, addMonths(one.account.gpsUntil, 3));
  assert.equal(extended.account.plan, 'quarter');
  assert.ok(extended.account.planActivatedAt >= one.account.planActivatedAt);
  assert.deepEqual((await (await issue(undefined, userCookie)).json()).account, extended.account);
  assert.equal(hasGpsAccess(extended.account), true);
  assert.equal(hasGpsAccess(extended.account, extended.account.gpsUntil), false);

  assert.equal((await issue({ action: 'login', phone: '555 123 456', password })).status, 400);
  const second = await issue({ action: 'login', phone: localPhone, password });
  assert.equal(second.status, 200);
  const newPassword = 'new-test-password-51';
  const change = { action: 'change-password', currentPassword: password, password: newPassword, confirmPassword: newPassword };
  assert.equal((await issue(change)).status, 401);
  assert.equal((await issue({ ...change, currentPassword: 'wrong' }, userCookie)).status, 401);
  assert.equal((await issue({ ...change, confirmPassword: 'mismatch' }, userCookie)).status, 400);
  const changed = await issue(change, userCookie);
  assert.equal(changed.status, 200);
  const rotated = sessionFrom(changed);
  assert.notEqual(rotated, userCookie);
  assert.deepEqual((await changed.json()).account, extended.account);
  for (const cookie of [userCookie, sessionFrom(second)]) {
    assert.equal((await (await issue(undefined, cookie)).json()).account, null);
  }
  assert.equal((await issue({ action: 'login', phone: localPhone, password })).status, 401);
  const loggedIn = await issue({ action: 'login', phone: localPhone, password: newPassword });
  assert.equal(loggedIn.status, 200);
  assert.equal((await issue({ action: 'logout' }, sessionFrom(loggedIn))).status, 200);
  assert.equal((await (await issue(undefined, sessionFrom(loggedIn))).json()).account, null);

  assert.equal((await issue({ action: 'revoke', phone, createdAt: account.createdAt }, adminCookie)).status, 200);
  const revoked = (await (await issue(undefined, rotated)).json()).account;
  assert.equal(revoked.phone, phone);
  assert.equal(revoked.planActivatedAt, null);
  assert.equal(revoked.plan, null);
  assert.equal(hasGpsAccess(revoked), false);
  const deletion = { action: 'delete', phone, createdAt: account.createdAt };
  assert.equal((await issue(deletion, rotated)).status, 403);
  assert.equal((await issue({ ...deletion, phone: SUPPORT_PHONE }, adminCookie)).status, 400);
  assert.equal((await issue(deletion, adminCookie)).status, 200);
  assert.equal((await issue(deletion, adminCookie)).status, 200);
  assert.deepEqual((await store.read('user/' + phone))?.data, { deleted: true });
  assert.equal((await (await issue(undefined, rotated)).json()).account, null);
  assert.equal((await issue({ action: 'login', phone: localPhone, password: newPassword })).status, 401);
  assert.equal((await issue({ ...grant, id: 'test-unique-grant-0003' }, adminCookie)).status, 404);
  const afterDeletion = await (await issue({ action: 'list' }, adminCookie)).json();
  assert.equal(afterDeletion.total, 0);
  assert.deepEqual(afterDeletion.accounts, []);
  const recreated = await issue({ action: 'register', phone: localPhone, password, confirmPassword: password });
  assert.equal(recreated.status, 200);
  assert.equal(hasGpsAccess((await recreated.json()).account), false);
  assert.equal((await issue(deletion, adminCookie)).status, 409);
});

test('plan prices match the requested tiers and month-end expiry follows the Tbilisi calendar', () => {
  assert.deepEqual(PLANS.map(({ months, price }) => [months, price]), [[1, 5], [3, 12], [6, 25], [12, 50]]);
  assert.equal(new Date(addMonths(Date.parse('2026-01-31T20:30:00Z'), 1)).toISOString(), '2026-02-28T20:30:00.000Z');
  assert.equal(new Date(addMonths(Date.parse('2026-01-31T10:00:00Z'), 1)).toISOString(), '2026-02-28T10:00:00.000Z');
});
