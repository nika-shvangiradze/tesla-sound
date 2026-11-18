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
