import assert from 'node:assert/strict';
import test from 'node:test';
import { driveTarget, IDLE_RPM, REDLINE_RPM, SPEED_TIMEOUT_MS, trackSpeed } from '../lib/drive-model.ts';
import { ENGINE_VOICES, makeEngineWave, VOICE_IDS } from '../lib/engine-wave.ts';

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

test('each engine voice keeps distinct stereo banks, bounded samples, and a smooth loop seam', () => {
  for (const id of VOICE_IDS) {
    const [left, right] = makeEngineWave(3600, id);
    assert.equal(left.length, 3600);
    assert.notDeepEqual(left, right);
    for (const wave of [left, right]) {
      assert.ok(wave.some((sample) => Math.abs(sample) > 0.5));
      assert.ok(wave.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 1));
      assert.ok(Math.abs(wave[0] - wave[wave.length - 1]) < 0.05);
    }
  }
});

test('the high-revving profiles raise virtual shift points and Hellcat stays below its own redline', () => {
  const cruising = trackSpeed(55, 1000, null);
  const original = driveTarget(cruising, null, 1000, ENGINE_VOICES.shelby.redlineRpm);
  assert.deepEqual(original, driveTarget(cruising, null, 1000));
  for (const id of ['ferrari', 'porsche'] as const) {
    assert.equal(ENGINE_VOICES[id].redlineRpm, 9000);
    const highRev = driveTarget(cruising, null, 1000, ENGINE_VOICES[id].redlineRpm);
    assert.ok(highRev.gear < original.gear);
    assert.ok(highRev.rpm > original.rpm);
  }
  const limit = ENGINE_VOICES.hellcat.redlineRpm;
  const heldGear = { gear: 1, shiftedAtMs: 1000 };
  assert.equal(driveTarget(trackSpeed(100, 1000, null), heldGear, 1000, limit).rpm, limit);
});

test('the flat-six, flat-plane V8 and Hellcat profiles each generate a distinct cycle', () => {
  const ferrari = makeEngineWave(3600, 'ferrari')[0];
  const porsche = makeEngineWave(3600, 'porsche')[0];
  const hellcat = makeEngineWave(3600, 'hellcat')[0];
  assert.equal(ENGINE_VOICES.ferrari.banks.length, 8);
  assert.equal(ENGINE_VOICES.porsche.banks.length, 6);
  assert.notDeepEqual(ferrari, porsche);
  assert.notDeepEqual(ferrari, hellcat);
  assert.notDeepEqual(porsche, hellcat);
  assert.ok(ENGINE_VOICES.hellcat.whine > 0);
});

test('C63 emphasizes higher engine orders than Shelby at the same RPM', () => {
  const [shelby] = makeEngineWave(3600, 'shelby');
  const [c63] = makeEngineWave(3600, 'c63');
  function relativeDifferenceEnergy(wave: Float32Array) {
    const total = wave.reduce((energy, sample) => energy + sample ** 2, 0);
    const highOrders = wave.reduce((energy, sample, index) =>
      energy + (sample - wave[(index + 1) % wave.length]) ** 2, 0);
    return highOrders / total;
  }
  assert.ok(relativeDifferenceEnergy(c63) > 2 * relativeDifferenceEnergy(shelby));
});
