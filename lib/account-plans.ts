export const SUPPORT_PHONE = '+995551099081';
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

export function normalizePhone(raw: unknown) {
  if (typeof raw !== 'string' || raw.length > 35) return null;
  const text = raw.trim().replace(/[\s()-]/g, '');
  const phone = /^5\d{8}$/.test(text) ? `+995${text}` : text;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
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
