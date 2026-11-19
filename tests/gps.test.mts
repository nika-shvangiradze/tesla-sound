import assert from 'node:assert/strict';
import test from 'node:test';
import { FIRST_FIX_MS, gapReason, makeFix, STALE_MS } from '../lib/gps.ts';

function position(speed: number | null, timestamp: number): GeolocationPosition {
  return { timestamp, coords: { speed, accuracy: 5 } } as GeolocationPosition;
}

test('missing speed remains null and zero is a valid speed', () => {
  assert.equal(makeFix(position(null, 1000), 1001, 1).speedKmh, null);
  assert.equal(makeFix(position(0, 1000), 1001, 1).speedKmh, 0);
  assert.equal(makeFix(position(10, 1000), 1001, 1).speedKmh, 36);
});

test('clock age, callback interval and source interval use the correct clocks', () => {
  const first = makeFix(position(0, 1000), 1200, 0);
  const latest = makeFix(position(0, 2100), 2600, 1390, first);
  assert.equal(first.callbackIntervalMs, null);
  assert.equal(first.positionIntervalMs, null);
  assert.equal(latest.dataAgeMs, 500);
  assert.equal(latest.positionIntervalMs, 1100);
  assert.equal(latest.callbackIntervalMs, 1390);
  assert.equal(makeFix(position(0, 2700), 2600, 1390, first).dataAgeMs, -100);
});

test('watchdog detects missing callbacks and stale timestamps independently', () => {
  const fresh = makeFix(position(0, 1000), 1000, 100);
  assert.equal(gapReason(undefined, FIRST_FIX_MS - 1), null);
  assert.match(gapReason(undefined, FIRST_FIX_MS) ?? '', /No GPS fix/);
  assert.equal(gapReason(fresh, 100 + STALE_MS - 1), null);
  assert.match(gapReason(fresh, 100 + STALE_MS) ?? '', /No GPS callback/);
  const stale = makeFix(position(0, 1000), 1000 + STALE_MS, 250);
  assert.match(gapReason(stale, 250) ?? '', /timestamp/);
});

test('Tesla-like relative microseconds keep speed and callback timing without causing false signal loss', () => {
  const received = 1_800_000_000_000;
  const first = makeFix(position(5, 80_000_000_000), received, 5_000);
  const next = makeFix(position(10, 80_000_100_000), received + 100, 5_100, first);
  assert.equal(next.rawPositionTimestamp, 80_000_100_000);
  assert.equal(next.positionTimestampMs, null);
  assert.equal(next.positionIntervalMs, null);
  assert.equal(next.dataAgeMs, null);
  assert.equal(next.callbackIntervalMs, 100);
  assert.equal(next.speedKmh, 36);
  assert.equal(gapReason(next, 5_193), null);
  assert.match(gapReason(next, 5_100 + 9_676) ?? '', /No GPS callback/);
});

test('epoch microseconds can be normalized when they match the browser wall clock', () => {
  const received = 1_800_000_000_000;
  const first = makeFix(position(5, (received - 200) * 1000), received, 0);
  const next = makeFix(position(10, (received - 100) * 1000), received + 100, 100, first);
  assert.equal(next.positionTimestampMs, received - 100);
  assert.equal(next.positionIntervalMs, 100);
  assert.equal(next.dataAgeMs, 200);
});
