import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { importReportLink, makeReportLinks, SAVED_REPORT_KEY, saveLocalReport } from '../lib/report-transfer.ts';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

const sample = { app: 'VoltSound GPS Diagnostic', schemaVersion: '1.0.0', fixes: [], events: [{ message: 'ტესტი' }] };
const page = 'https://voltsound.example/?ignored=1';

test('single QR transfers the full UTF-8 JSON and saves it on the receiving device', () => {
  const receiver = storage();
  const [link] = makeReportLinks(JSON.stringify(sample), page);
  const url = new URL(link);
  assert.equal(url.search, '');
  const result = importReportLink(url.hash, receiver);
  assert.ok(result && 'json' in result && result.saved);
  assert.deepEqual(JSON.parse(result.json), sample);
  assert.equal(receiver.getItem(SAVED_REPORT_KEY), result.json);
});

test('multipart QR survives separate page loads, duplicate scans and reversed order', () => {
  const report = { ...sample, fixes: Array.from({ length: 20 }, () => ({ sample: randomBytes(48).toString('hex') })) };
  const receiver = storage();
  const links = makeReportLinks(JSON.stringify(report), page).reverse();
  assert.ok(links.length > 1);
  const first = new URL(links[0]).hash;
  assert.deepEqual(importReportLink(first, receiver), { received: 1, total: links.length });
  assert.deepEqual(importReportLink(first, receiver), { received: 1, total: links.length });
  const results = links.slice(1).map((link) => importReportLink(new URL(link).hash, receiver));
  const last = results.at(-1);
  assert.ok(last && 'json' in last && last.saved);
  assert.deepEqual(JSON.parse(last.json), report);
  assert.equal(receiver.length, 1);
});

test('single QR can be read without storage and invalid fragments are rejected', () => {
  const [link] = makeReportLinks(JSON.stringify(sample), page);
  const result = importReportLink(new URL(link).hash);
  assert.ok(result && 'json' in result && !result.saved);
  assert.equal(saveLocalReport(undefined, result.json), false);
  assert.throws(() => importReportLink('#voltsound-report=invalid'), /invalid/);
  assert.equal(importReportLink('#events'), null);
});
