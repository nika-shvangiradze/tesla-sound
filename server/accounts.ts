import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { addMonths, parsePhoneInput, PLANS, storedPhone, SUPPORT_PHONE } from '../lib/account-plans.ts';
import type { AccountView } from '../lib/account-plans.ts';

const SESSION_SECONDS = 30 * 24 * 60 * 60;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const DUMMY_PASSWORD = `${'0'.repeat(32)}:${'0'.repeat(64)}`;

type Session = { digest: string; expires: number };
type Account = Omit<AccountView, 'planActivatedAt'> & {
  planActivatedAt?: number | null;
  passwordHash: string;
  sessions: Session[];
  appliedGrants: string[];
};
type AccountRecord = Account | { deleted: true };
type Rate = { until: number; count: number };
type Stored<T> = { data: T; etag: string };
type WriteOptions = { onlyIfNew: true } | { onlyIfMatch: string };

export interface AccountStore {
  read<T>(key: string): Promise<Stored<T> | null>;
  write(key: string, value: unknown, options: WriteOptions): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
}

class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, { N: 32768, r: 8, p: 2, maxmem: 64 * 1024 * 1024 },
      (error, value) => error ? reject(error) : resolve(value));
  });
}

async function createPasswordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + (await derive(password, salt)).toString('hex');
}

async function matchesPassword(password: string, stored: string) {
  const [salt, digest] = stored.split(':');
  return timingSafeEqual(await derive(password, salt), Buffer.from(digest, 'hex'));
}

function summary(account: Account): AccountView {
  const { phone, role, createdAt, gpsUntil, plan, planActivatedAt = null } = account;
  return { phone, role, createdAt, gpsUntil, plan, planActivatedAt };
}

function reply(data: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (cookie) headers.set('Set-Cookie', cookie);
  return Response.json(data, { status, headers });
}

function cookies(req: Request) {
  const secure = new URL(req.url).protocol === 'https:';
  const name = secure ? '__Host-voltroar' : 'voltroar-local';
  const value = req.headers.get('cookie')?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
  const format = (token: string, age: number) =>
    `${name}=${token}; Max-Age=${age}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  const [rawPhone, token] = value.split('.');
  const phone = storedPhone(rawPhone);
  return {
    format, phone,
    digest: token && /^[\da-f]{64}$/.test(token) ? hash(token) : null,
  };
}

function activeAccount(record: AccountRecord | undefined): record is Account {
  return !!record && !('deleted' in record);
}

function currentSession(account: Account, digest: string | null, now: number) {
  return account.sessions.some((session) => session.digest === digest && session.expires > now);
}

function newSession(now: number) {
  const token = randomBytes(32).toString('hex');
  return { token, session: { digest: hash(token), expires: now + SESSION_SECONDS * 1000 } };
}

async function edit<T>(store: AccountStore, key: string, update: (value: T) => T) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const entry = await store.read<T>(key);
    if (!entry) throw new ApiError(404, 'Account not found.');
    const updated = update(entry.data);
    if (updated === entry.data || await store.write(key, updated, { onlyIfMatch: entry.etag })) return updated;
  }
  throw new ApiError(409, 'This account was changed. Try again.');
}

async function throttle(store: AccountStore, name: string, limit: number, now: number) {
  const key = 'rate/' + hash(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const entry = await store.read<Rate>(key);
    const current = entry && entry.data.until > now ? entry.data : { until: now + RATE_WINDOW_MS, count: 0 };
    if (current.count >= limit) throw new ApiError(429, 'Too many attempts. Try again in 15 minutes.');
    if (await store.write(key, { ...current, count: current.count + 1 },
      entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true })) return;
  }
  throw new ApiError(429, 'Please wait before trying again.');
}

export async function handleAccount(req: Request, store: AccountStore, ip: string, setupDigest: string) {
  try {
    const now = Date.now();
    const cookie = cookies(req);
    const loadSession = async () => {
      if (!cookie.phone || !cookie.digest) return null;
      const record = (await store.read<AccountRecord>('user/' + cookie.phone))?.data;
      return activeAccount(record) && currentSession(record, cookie.digest, now) ? record : null;
    };

    if (req.method === 'GET') {
      const account = await loadSession();
      return reply({ account: account ? summary(account) : null, serverTime: now });
    }
    if (req.method !== 'POST') throw new ApiError(405, 'Method unavailable.');
    const url = new URL(req.url);
    if (req.headers.get('origin') !== url.origin || !req.headers.get('content-type')?.startsWith('application/json')) {
      throw new ApiError(403, 'Request origin was not accepted.');
    }
    const raw = await req.text();
    if (raw.length > 4096) throw new ApiError(413, 'Request is too large.');
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      body = parsed;
    } catch {
      throw new ApiError(400, 'Invalid request.');
    }
    const action = body.action;
    if (action === 'register' || action === 'login' || action === 'setup') {
      await throttle(store, `${action}:${ip}`, action === 'login' ? 22 : action === 'setup' ? 5 : 8, now);
      const phone = parsePhoneInput(body.phone, action === 'login');
      const password = body.password;
      if (!phone) throw new ApiError(400, 'Enter your phone number as 9 digits without spaces, for example 555555555.');
      if (typeof password !== 'string' || password.length > 128 || !password) throw new ApiError(400, 'Enter a valid password.');
      const { token, session } = newSession(now);
      const key = 'user/' + phone;
      let account: AccountRecord;

      if (action === 'login') {
        const record = (await store.read<AccountRecord>(key))?.data;
        const valid = activeAccount(record);
        const matched = await matchesPassword(password, valid ? record.passwordHash : DUMMY_PASSWORD);
        if (!valid || !matched) throw new ApiError(401, 'Phone number or password is incorrect.');
        account = await edit<AccountRecord>(store, key, (value) => {
          if (!activeAccount(value) || value.passwordHash !== record.passwordHash) {
            throw new ApiError(401, 'Phone number or password is incorrect.');
          }
          return { ...value, sessions: [...value.sessions.filter((prior) => prior.expires > now).slice(-7), session] };
        });
      } else {
        const isAdmin = action === 'setup';
        if (isAdmin && (
          phone !== SUPPORT_PHONE || !/^[\da-f]{64}$/.test(setupDigest) ||
          typeof body.setupToken !== 'string' ||
          !timingSafeEqual(Buffer.from(setupDigest, 'hex'), Buffer.from(hash(body.setupToken), 'hex'))
        )) throw new ApiError(403, 'Administrator setup is unavailable or the code is incorrect.');
        if (!isAdmin && phone === SUPPORT_PHONE) throw new ApiError(400, 'This number is reserved for the administrator.');
        if (password.length < (isAdmin ? 12 : 8)) throw new ApiError(400, `Use at least ${isAdmin ? 12 : 8} characters for the password.`);
        if (password !== body.confirmPassword) throw new ApiError(400, 'The passwords do not match.');
        account = {
          phone, role: isAdmin ? 'admin' : 'user', createdAt: now, gpsUntil: null, plan: null, planActivatedAt: null,
          passwordHash: await createPasswordHash(password), sessions: [session], appliedGrants: [],
        };
        const prior = await store.read<AccountRecord>(key);
        if (activeAccount(prior?.data) || !await store.write(key, account,
          prior ? { onlyIfMatch: prior.etag } : { onlyIfNew: true })) {
          throw new ApiError(409, 'An account already exists for this number.');
        }
      }
      if (!activeAccount(account)) throw new ApiError(401, 'Sign in to continue.');
      return reply({ account: summary(account), serverTime: now }, 200, cookie.format(`${phone}.${token}`, SESSION_SECONDS));
    }

    const account = await loadSession();
    if (action === 'logout') {
      if (account) await edit<AccountRecord>(store, 'user/' + account.phone, (value) => activeAccount(value) ? ({
        ...value, sessions: value.sessions.filter((session) => session.digest !== cookie.digest),
      }) : value);
      return reply({ account: null, serverTime: now }, 200, cookie.format('', 0));
    }
    if (!account) throw new ApiError(401, 'Sign in to continue.');
    if (action === 'change-password') {
      await throttle(store, `change-password:${account.phone}`, 8, now);
      const { currentPassword, password, confirmPassword } = body;
      const minLength = account.role === 'admin' ? 12 : 8;
      if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128) {
        throw new ApiError(400, 'Enter your current password.');
      }
      if (typeof password !== 'string' || password.length < minLength || password.length > 128) {
        throw new ApiError(400, `Use ${minLength} to 128 characters for the new password.`);
      }
      if (password !== confirmPassword) throw new ApiError(400, 'The passwords do not match.');
      if (password === currentPassword) throw new ApiError(400, 'Choose a different password.');
      if (!await matchesPassword(currentPassword, account.passwordHash)) throw new ApiError(401, 'Current password is incorrect.');
      const passwordHash = await createPasswordHash(password);
      const { token, session } = newSession(now);
      const updated = await edit<AccountRecord>(store, 'user/' + account.phone, (value) => {
        if (!activeAccount(value) || value.passwordHash !== account.passwordHash || !currentSession(value, cookie.digest, now)) {
          throw new ApiError(401, 'Sign in again to change your password.');
        }
        return { ...value, passwordHash, sessions: [session] };
      });
      if (!activeAccount(updated)) throw new ApiError(401, 'Sign in to continue.');
      return reply({ account: summary(updated), serverTime: now }, 200, cookie.format(`${account.phone}.${token}`, SESSION_SECONDS));
    }
    if (account.role !== 'admin') throw new ApiError(403, 'Administrator access required.');

    if (action === 'list') {
      const search = typeof body.search === 'string' ? body.search.replace(/\D/g, '').slice(0, 15) : '';
      const keys = (await store.list('user/')).filter((key) => key !== 'user/' + SUPPORT_PHONE && key.includes(search)).sort();
      const offset = typeof body.offset === 'number' && Number.isSafeInteger(body.offset) && body.offset >= 0 ? body.offset : 0;
      const users: AccountView[] = [];
      let total = 0;
      for (let index = 0; index < keys.length; index += 20) {
        const batch = await Promise.all(keys.slice(index, index + 20).map((key) => store.read<AccountRecord>(key)));
        for (const entry of batch) {
          if (!activeAccount(entry?.data) || entry.data.role !== 'user') continue;
          if (total >= offset && users.length < 20) users.push(summary(entry.data));
          total++;
        }
      }
      return reply({ accounts: users, total, serverTime: now });
    }

    if (action !== 'grant' && action !== 'revoke' && action !== 'delete') throw new ApiError(400, 'Unknown action.');
    const phone = storedPhone(body.phone);
    if (!phone || phone === SUPPORT_PHONE) throw new ApiError(400, 'Choose a user account.');
    if (action === 'delete' && !Number.isSafeInteger(body.createdAt)) throw new ApiError(400, 'Refresh and select a user account.');
    const plan = PLANS.find((item) => item.id === body.plan);
    const grantId = typeof body.id === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(body.id) ? body.id : null;
    if (action === 'grant' && (!plan || !grantId)) throw new ApiError(400, 'Choose one of the available plans.');
    const updated = await edit<AccountRecord>(store, 'user/' + phone, (value) => {
      if (!activeAccount(value)) {
        if (action === 'delete') return value;
        throw new ApiError(404, 'Account not found.');
      }
      if (value.role !== 'user') throw new ApiError(400, 'Choose a user account.');
      if (body.createdAt !== undefined && body.createdAt !== value.createdAt) {
        throw new ApiError(409, 'This account changed. Refresh the user list and try again.');
      }
      // Conditional replacement clears credentials and access without racing a new registration.
      if (action === 'delete') return { deleted: true };
      if (action === 'grant' && plan && grantId) {
        if (value.appliedGrants.includes(grantId)) return value;
        return {
          ...value, gpsUntil: addMonths(Math.max(now, value.gpsUntil ?? 0), plan.months), plan: plan.id,
          planActivatedAt: now,
          appliedGrants: [...value.appliedGrants.slice(-29), grantId],
        };
      }
      return { ...value, gpsUntil: null, plan: null, planActivatedAt: null };
    });
    return reply({ account: activeAccount(updated) ? summary(updated) : null });
  } catch (error) {
    if (error instanceof ApiError) return reply({ error: error.message }, error.status);
    console.error('VoltRoar account service error', error instanceof Error ? error.name : 'UnknownError');
    return reply({ error: 'The account service is temporarily unavailable. Try again.' }, 503);
  }
}
