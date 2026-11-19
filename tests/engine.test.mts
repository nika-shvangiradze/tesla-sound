import assert from 'node:assert/strict';
import test from 'node:test';
import { driveTarget, IDLE_RPM, REDLINE_RPM, SPEED_TIMEOUT_MS, trackSpeed } from '../lib/drive-model.ts';
import { makeEngineWave } from '../lib/engine-wave.ts';

test('GPS drive starts in a suitable gear and locks shifts until the shift interval elapses', () => {
  const cruising = trackSpeed(85, 1000, null);
  const first = driveTarget(cruising, null, 1000);
  assert.ok(first.gear > 1 && first.gear <= 6);
  assert.ok(first.rpm > IDLE_RPM && first.rpm <= REDLINE_RPM);
  const early = driveTarget(cruising, { gear: 1, shiftedAtMs: 1000 }, 1100);
  const later = driveTarget(cruising, early, 1400);
  assert.equal(early.gear, 1);
  assert.equal(later.gear, 2);
  assert.ok(later.rpm < early.rpm);
});

test('prediction raises RPM on acceleration and tapers away before a GPS outage returns to idle', () => {
  const tracking = trackSpeed(20, 1100, trackSpeed(14, 1000, null));
  const noAcceleration = { ...tracking, accelerationMps2: 0 };
  assert.ok(tracking.accelerationMps2 > 0 && tracking.accelerationMps2 < 7);
  assert.ok(driveTarget(tracking, null, 1100).rpm > driveTarget(noAcceleration, null, 1100).rpm);
  assert.equal(driveTarget(tracking, null, 1700).rpm, driveTarget(noAcceleration, null, 1700).rpm);
  const stale = driveTarget(tracking, null, 1100 + SPEED_TIMEOUT_MS);
  assert.equal(stale.fresh, false);
  assert.equal(stale.rpm, IDLE_RPM);
  assert.equal(trackSpeed(85, 3000, tracking).accelerationMps2, 0);
});

test('at zero speed the virtual gearbox returns to first and idles', () => {
  const stationary = trackSpeed(0, 3000, trackSpeed(60, 2950, null));
  const target = driveTarget(stationary, { gear: 4, shiftedAtMs: 2990 }, 3000);
  assert.equal(target.gear, 1);
  assert.equal(target.rpm, IDLE_RPM);
  assert.equal(target.fresh, true);
});

test('the V8 wavetable yields distinct, bounded stereo pulses and a smooth loop seam', () => {
  const [left, right] = makeEngineWave(3600);
  assert.equal(left.length, 3600);
  assert.notDeepEqual(left, right);
  for (const wave of [left, right]) {
    assert.ok(wave.some((sample) => Math.abs(sample) > 0.5));
    assert.ok(wave.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 1));
    assert.ok(Math.abs(wave[0] - wave[wave.length - 1]) < 0.05);
  }
});
