import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { addMonths, normalizePhone, PLANS, SUPPORT_PHONE } from '../lib/account-plans.ts';
import type { AccountView } from '../lib/account-plans.ts';

const SESSION_SECONDS = 30 * 24 * 60 * 60;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const DUMMY_PASSWORD = `${'0'.repeat(32)}:${'0'.repeat(64)}`;

type Session = { digest: string; expires: number };
type Account = AccountView & { passwordHash: string; sessions: Session[]; appliedGrants: string[] };
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
  return { phone: account.phone, role: account.role, createdAt: account.createdAt, gpsUntil: account.gpsUntil, plan: account.plan };
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
  const phone = normalizePhone(rawPhone);
  return {
    format, phone,
    digest: token && /^[\da-f]{64}$/.test(token) ? hash(token) : null,
  };
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
      const entry = await store.read<Account>('user/' + cookie.phone);
      return entry?.data.sessions.some((session) => session.digest === cookie.digest && session.expires > now)
        ? entry.data : null;
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
    const phone = normalizePhone(body.phone);

    if (action === 'register' || action === 'login' || action === 'setup') {
      await throttle(store, `${action}:${ip}`, action === 'login' ? 22 : action === 'setup' ? 5 : 8, now);
      const password = body.password;
      if (!phone || typeof password !== 'string' || password.length > 128 || !password) {
        throw new ApiError(400, 'Enter a valid phone number and password.');
      }
      const token = randomBytes(32).toString('hex');
      const session = { digest: hash(token), expires: now + SESSION_SECONDS * 1000 };
      const key = 'user/' + phone;
      let account: Account;

      if (action === 'login') {
        const entry = await store.read<Account>(key);
        const matched = await matchesPassword(password, entry?.data.passwordHash ?? DUMMY_PASSWORD);
        if (!entry || !matched) throw new ApiError(401, 'Phone number or password is incorrect.');
        account = await edit<Account>(store, key, (value) => ({
          ...value, sessions: [...value.sessions.filter((prior) => prior.expires > now).slice(-7), session],
        }));
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
          phone, role: isAdmin ? 'admin' : 'user', createdAt: now, gpsUntil: null, plan: null,
          passwordHash: await createPasswordHash(password), sessions: [session], appliedGrants: [],
        };
        if (!await store.write(key, account, { onlyIfNew: true })) throw new ApiError(409, 'An account already exists for this number.');
      }
      return reply({ account: summary(account), serverTime: now }, 200, cookie.format(`${phone}.${token}`, SESSION_SECONDS));
    }

    const account = await loadSession();
    if (action === 'logout') {
      if (account) await edit<Account>(store, 'user/' + account.phone, (value) => ({
        ...value, sessions: value.sessions.filter((session) => session.digest !== cookie.digest),
      }));
      return reply({ account: null, serverTime: now }, 200, cookie.format('', 0));
    }
    if (!account) throw new ApiError(401, 'Sign in to continue.');
    if (account.role !== 'admin') throw new ApiError(403, 'Administrator access required.');

    if (action === 'list') {
      const search = typeof body.search === 'string' ? body.search.replace(/\D/g, '').slice(0, 15) : '';
      const keys = (await store.list('user/')).filter((key) => key !== 'user/' + SUPPORT_PHONE && key.includes(search)).sort();
      const offset = typeof body.offset === 'number' && Number.isSafeInteger(body.offset) && body.offset >= 0 ? body.offset : 0;
      const users = await Promise.all(keys.slice(offset, offset + 20).map((key) => store.read<Account>(key)));
      return reply({ accounts: users.flatMap((entry) => entry ? [summary(entry.data)] : []), total: keys.length, serverTime: now });
    }

    if (action !== 'grant' && action !== 'revoke') throw new ApiError(400, 'Unknown action.');
    if (!phone || phone === SUPPORT_PHONE) throw new ApiError(400, 'Choose a user account.');
    const plan = PLANS.find((item) => item.id === body.plan);
    const grantId = typeof body.id === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(body.id) ? body.id : null;
    if (action === 'grant' && (!plan || !grantId)) throw new ApiError(400, 'Choose one of the available plans.');
    const updated = await edit<Account>(store, 'user/' + phone, (value) => {
      if (action === 'grant' && plan && grantId) {
        if (value.appliedGrants.includes(grantId)) return value;
        return {
          ...value, gpsUntil: addMonths(Math.max(now, value.gpsUntil ?? 0), plan.months), plan: plan.id,
          appliedGrants: [...value.appliedGrants.slice(-29), grantId],
        };
      }
      return { ...value, gpsUntil: null, plan: null };
    });
    return reply({ account: summary(updated) });
  } catch (error) {
    if (error instanceof ApiError) return reply({ error: error.message }, error.status);
    console.error('VoltRoar account service error', error instanceof Error ? error.name : 'UnknownError');
    return reply({ error: 'The account service is temporarily unavailable. Try again.' }, 503);
  }
}
