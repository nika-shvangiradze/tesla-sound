export const SUPPORT_PHONE = '+995551099081';
export const LOCAL_PHONE_PATTERN = '5[0-9]{8}';
const LEGACY_PHONE_PATTERN = '[+](?!9955[0-9]{8}$)[1-9][0-9]{7,14}';
export const SIGN_IN_PHONE_PATTERN = `${LOCAL_PHONE_PATTERN}|${LEGACY_PHONE_PATTERN}`;
const localPhone = new RegExp(`^(?:${LOCAL_PHONE_PATTERN})$`);
const signInPhone = new RegExp(`^(?:${SIGN_IN_PHONE_PATTERN})$`);
export const PLANS = [
  { id: 'month', months: 1, price: 5, label: '1 month' },
  { id: 'quarter', months: 3, price: 12, label: '3 months' },
  { id: 'half-year', months: 6, price: 25, label: '6 months' },
  { id: 'year', months: 12, price: 50, label: '1 year' },
] as const;

export type PlanId = typeof PLANS[number]['id'];
export type AccountView = {
  phone: string;
  role: 'user' | 'admin';
  createdAt: number;
  gpsUntil: number | null;
  plan: PlanId | null;
};

export function hasGpsAccess(account: AccountView | null, now = Date.now()) {
  return account?.role === 'admin' || (account?.gpsUntil ?? 0) > now;
}

export function parsePhoneInput(raw: unknown, signIn = false) {
  if (typeof raw !== 'string' || !(signIn ? signInPhone : localPhone).test(raw)) return null;
  return raw.startsWith('+') ? raw : `+995${raw}`;
}

export function storedPhone(raw: unknown) {
  return typeof raw === 'string' && /^\+[1-9][0-9]{7,14}$/.test(raw) ? raw : null;
}

export function addMonths(timestamp: number, months: number) {
  const tbilisiOffset = 4 * 60 * 60 * 1000;
  const date = new Date(timestamp + tbilisiOffset);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime() - tbilisiOffset;
}
