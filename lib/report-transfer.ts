import { gunzipSync, gzipSync } from 'fflate';

export const SAVED_REPORT_KEY = 'voltsound.saved-report.v1';
const TRANSFER_KEY = 'voltsound.partial-report.v1';
const PREFIX = '#voltsound-report=';
const CHUNK_SIZE = 1050;
const MAX_PARTS = 200;
const MAX_REPORT_BYTES = 3_000_000;

type Part = { id: string; index: number; count: number; data: string };
type PartialReport = Pick<Part, 'id' | 'count'> & { chunks: Record<number, string> };

export type ImportResult =
  | { received: number; total: number }
  | { json: string; saved: boolean };

export function makeReportLinks(json: string, pageUrl: string) {
  const bytes = new TextEncoder().encode(JSON.stringify(JSON.parse(json)));
  if (bytes.length > MAX_REPORT_BYTES) throw new Error('This report is too large for QR transfer.');
  const compressed = gzipSync(bytes, { mtime: 0 });
  const payload = btoa(Array.from(compressed, (byte) => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const count = Math.ceil(payload.length / CHUNK_SIZE);
  if (count > MAX_PARTS) throw new Error('This report is too large for QR transfer.');
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const base = new URL(pageUrl);
  base.search = '';
  base.hash = '';

  return Array.from({ length: count }, (_, index) => {
    const chunk = payload.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
    return `${base.href}${PREFIX}${id}.${index + 1}.${count}.${chunk}`;
  });
}

function parsePart(hash: string): Part | null {
  if (!hash.startsWith(PREFIX)) return null;
  const match = /^([a-f0-9]{16})\.(\d{1,3})\.(\d{1,3})\.([\w-]{1,1050})$/.exec(hash.slice(PREFIX.length));
  if (!match) throw new Error('This report QR code is invalid.');
  const [, id, indexText, countText, data] = match;
  const index = Number(indexText);
  const count = Number(countText);
  if (index < 1 || index > count || count > MAX_PARTS) throw new Error('This report QR code is invalid.');
  return { id, index, count, data };
}

function decode(payload: string) {
  const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const compressed = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (compressed.length < 18) throw new Error('This report is incomplete.');
  // Bound inflation using the gzip trailer before allocating any output.
  const size = new DataView(compressed.buffer).getUint32(compressed.length - 4, true);
  if (size === 0 || size > MAX_REPORT_BYTES) throw new Error('This report is too large.');
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
    gunzipSync(compressed, { out: new Uint8Array(size) }),
  ));
  if (data?.app !== 'VoltSound GPS Diagnostic' || data.schemaVersion !== '1.0.0' ||
      !Array.isArray(data.fixes) || !Array.isArray(data.events)) {
    throw new Error('This is not a VoltSound diagnostic report.');
  }
  return JSON.stringify(data, null, 2);
}

export function saveLocalReport(storage: Storage | undefined, json: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVED_REPORT_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function importReportLink(hash: string, storage?: Storage): ImportResult | null {
  const part = parsePart(hash);
  if (!part) return null;
  if (part.count === 1) {
    const json = decode(part.data);
    return { json, saved: saveLocalReport(storage, json) };
  }
  if (!storage) throw new Error('Browser storage is required to collect multiple QR codes.');
  const stored = storage.getItem(TRANSFER_KEY);
  const prior: PartialReport | null = stored ? JSON.parse(stored) : null;
  const chunks = prior?.id === part.id && prior.count === part.count ? prior.chunks : {};
  chunks[part.index] = part.data;
  const received = Object.keys(chunks).length;
  if (received < part.count) {
    storage.setItem(TRANSFER_KEY, JSON.stringify({ id: part.id, count: part.count, chunks }));
    return { received, total: part.count };
  }
  const payload = Array.from({ length: part.count }, (_, index) => chunks[index + 1]).join('');
  const json = decode(payload);
  const saved = saveLocalReport(storage, json);
  storage.removeItem(TRANSFER_KEY);
  return { json, saved };
}

export function downloadReport(output: string) {
  const url = URL.createObjectURL(new Blob([output], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `voltsound-diagnostic-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
