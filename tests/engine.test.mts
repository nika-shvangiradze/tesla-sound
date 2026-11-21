import assert from 'node:assert/strict';
import test from 'node:test';
import { driveTarget, engagedRpm, SPEED_TIMEOUT_MS, trackSpeed } from '../lib/drive-model.ts';
import { displaySpeed, gaugeAngle, gaugeTicks } from '../lib/instrument-scale.ts';
import { VEHICLES } from '../lib/vehicle-profiles.ts';
import { ENGINE_VOICES, LOOP_CYCLES, makeEngineLoop, makeEngineWave, supraBoostTarget, VOICE_IDS } from '../lib/engine-wave.ts';

test('all variants have bounded forward gearing and can reach their highest gear', () => {
  const counts = { shelby: 4, c63: 7, ferrari: 7, porsche: 7, hellcat: 8,
    countach: 5, huracan: 7, demon: 8, subaru: 6, m5: 7, supra: 6, m3: 6, gaz24: 4 } as const;
  assert.deepEqual(Object.keys(VEHICLES).sort(), [...VOICE_IDS].sort());
  for (const id of VOICE_IDS) {
    const { gearbox, engine, cluster } = VEHICLES[id];
    assert.equal(gearbox.ratios.length, counts[id], id);
    assert.ok(gearbox.ratios.every((ratio, index) => ratio > 0 && (!index || ratio < gearbox.ratios[index - 1])), id);
    assert.ok(gearbox.finalDrive > 0 && gearbox.circumferenceM > 0, id);
    assert.ok(gearbox.reverseRatios === null || gearbox.reverseRatios.every((ratio) => ratio > 0), id);
    assert.ok(engine.idleRpm < engine.redlineRpm && engine.redlineRpm <= engine.limiterRpm && engine.limiterRpm <= cluster.tach.max, id);
    const high = driveTarget(trackSpeed(240, 1000, null), null, 1000, VEHICLES[id]);
    assert.equal(high.gear, counts[id], id);
    assert.ok(high.rpm >= engine.idleRpm && high.rpm <= engine.limiterRpm, id);
  }
});

test('all dial endpoints and ticks share the needle calibration', () => {
  for (const { cluster, engine } of Object.values(VEHICLES)) {
    for (const scale of [cluster.speed.scale, cluster.tach]) {
      if (!scale) continue;
      const ticks = gaugeTicks(scale);
      assert.equal(gaugeAngle(scale, scale.min - 1), scale.start);
      assert.equal(gaugeAngle(scale, scale.max + 1), scale.start + scale.sweep);
      assert.equal(ticks.at(-1)?.major, true);
      assert.ok(ticks.every((tick, index) => !index || tick.angle > ticks[index - 1].angle));
      for (const [value, angle] of scale.calibration ?? []) assert.equal(gaugeAngle(scale, value), angle);
      assert.ok(ticks.filter((tick) => tick.major).every((tick) => tick.angle === gaugeAngle(scale, tick.value)));
    }
    assert.ok(gaugeAngle(cluster.tach, engine.redlineRpm) <= gaugeAngle(cluster.tach, engine.limiterRpm));
  }
  const m5 = VEHICLES.m5.cluster.speed.scale!;
  assert.notEqual(gaugeAngle(m5, 120), m5.start + 120 / m5.max * m5.sweep);
  assert.equal(displaySpeed(160.9344, 'mph'), 100);
  assert.equal(displaySpeed(0, 'km/h'), 0);
});

test('engaged RPM uses the selected gearbox and wheel speed', () => {
  for (const id of ['shelby', 'countach', 'm5', 'hellcat'] as const) {
    const vehicle = VEHICLES[id];
    const tracking = trackSpeed(100, 1000, null);
    const result = driveTarget(tracking, null, 1000, vehicle);
    assert.ok(typeof result.gear === 'number');
    const { ratios, finalDrive, circumferenceM } = vehicle.gearbox;
    const expected = 100_000 / (60 * circumferenceM) * ratios[result.gear - 1] * finalDrive;
    assert.ok(Math.abs(engagedRpm(100, result.gear, vehicle.gearbox) - expected) < 1e-9);
    assert.ok(Math.abs(result.rpm - expected) < 1e-9);
  }
});

test('standstill, clutch slip and stale speed have separate behavior', () => {
  for (const [id, expectedGear] of [['shelby', 'N'], ['hellcat', 1]] as const) {
    const car = VEHICLES[id];
    const stationary = trackSpeed(0, 1100, trackSpeed(80, 1000, null));
    const rest = driveTarget(stationary, { gear: 3, shiftedAtMs: 1000 }, 1100, car);
    assert.equal(rest.gear, expectedGear);
    assert.equal(rest.rpm, car.engine.idleRpm);
    assert.equal(rest.fresh, true);
    const launch = driveTarget(trackSpeed(5, 1200, null), rest, 1200, car);
    assert.equal(launch.gear, 1);
    assert.ok(launch.rpm >= car.engine.idleRpm);
    assert.notEqual(launch.rpm, engagedRpm(5, 1, car.gearbox));
    const stale = driveTarget(stationary, rest, 1100 + SPEED_TIMEOUT_MS, car);
    assert.equal(stale.fresh, false);
    assert.equal(stale.rpm, car.engine.idleRpm);
  }
});

test('prediction raises simulated RPM only while speed samples are recent', () => {
  const tracking = trackSpeed(20, 1100, trackSpeed(14, 1000, null));
  const constant = { ...tracking, accelerationMps2: 0 };
  const vehicle = VEHICLES.shelby;
  const gear = { gear: 1, shiftedAtMs: 1000 };
  assert.ok(driveTarget(tracking, gear, 1100, vehicle).rpm > driveTarget(constant, gear, 1100, vehicle).rpm);
  assert.equal(driveTarget(tracking, null, 1700, vehicle).rpm, driveTarget(constant, null, 1700, vehicle).rpm);
  assert.equal(trackSpeed(85, 3000, tracking).accelerationMps2, 0);
});

test('a shift interrupts load, respects gearbox cadence, and downshifts with hysteresis', () => {
  const at = (speed: number, now: number, accel = 0) => ({ ...trackSpeed(speed, now, null), accelerationMps2: accel });
  const auto = VEHICLES.hellcat;
  const held = driveTarget(at(65, 1100), { gear: 1, shiftedAtMs: 1000 }, 1100, auto);
  assert.equal(held.gear, 1);
  const up = driveTarget(at(65, 1500), held, 1500, auto);
  assert.equal(up.gear, 2);
  assert.equal(up.shift, 'up');
  assert.ok(up.load < held.load);
  const engaged = driveTarget(at(65, 1700), up, 1700, auto);
  assert.equal(engaged.shift, null);
  assert.ok(engaged.rpm < up.rpm);
  const down = driveTarget(at(35, 2100, -2.8), { gear: 5, shiftedAtMs: 1500 }, 2100, auto);
  assert.equal(down.gear, 4);
  assert.equal(down.shift, 'down');
  const blip = driveTarget(at(35, 2200, -2.8), down, 2200, auto);
  assert.ok(blip.rpm > down.rpm && blip.load > down.load);
  const stable = driveTarget(at(35, 2450), blip, 2450, auto);
  assert.equal(stable.gear, down.gear);
  assert.equal(stable.shift, null);
  const changing = { gear: 2, fromGear: 1, shiftedAtMs: 1000 };
  assert.equal(driveTarget(at(75, 1125), changing, 1125, VEHICLES.porsche).shift, null);
  assert.equal(driveTarget(at(75, 1125), changing, 1125, VEHICLES.countach).shift, 'up');
});

test('the simulated limiter is separate from the red band and gauge maximum', () => {
  const m5 = VEHICLES.m5;
  const held = { gear: 1, shiftedAtMs: 1000 };
  assert.equal(driveTarget(trackSpeed(120, 1000, null), held, 1000, VEHICLES.hellcat).rpm, VEHICLES.hellcat.engine.limiterRpm);
  assert.equal(driveTarget(trackSpeed(150, 1000, null), held, 1000, m5).rpm, 8_250);
  assert.equal(m5.engine.redlineRpm, 8_000);
  assert.equal(m5.cluster.tach.max, 9_000);
});

test('the four-cycle engine loop adds variation without changing the cycle length or clipping', () => {
  const frames = 3600;
  const [wave] = makeEngineLoop(frames, 'shelby');
  assert.equal(wave.length, frames * LOOP_CYCLES);
  assert.ok(wave.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 1));
  assert.notDeepEqual(wave.slice(0, frames), wave.slice(frames, frames * 2));
  assert.ok(Math.abs(wave[0] - wave[wave.length - 1]) < 0.05);
});

test('the road-going E46 M3 uses an S54 six-cylinder waveform and the European manual gearbox', () => {
  const m3 = VEHICLES.m3;
  assert.equal(ENGINE_VOICES.m3.banks.length, 6);
  assert.equal(ENGINE_VOICES.m3.whine, null);
  assert.notDeepEqual(makeEngineWave(3600, 'm3'), makeEngineWave(3600, 'porsche'));
  assert.notDeepEqual(makeEngineWave(3600, 'm3'), makeEngineWave(3600, 'supra'));
  assert.deepEqual(m3.gearbox.ratios, [4.227, 2.528, 1.669, 1.226, 1, 0.828]);
  assert.equal(m3.gearbox.finalDrive, 3.62);
  assert.equal(m3.engine.limiterRpm, 8_000);
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

test('the flat-six, flat-plane V8 and Hellcat profiles each generate a distinct cycle', () => {
  const ferrari = makeEngineWave(3600, 'ferrari')[0];
  const porsche = makeEngineWave(3600, 'porsche')[0];
  const hellcat = makeEngineWave(3600, 'hellcat')[0];
  assert.equal(ENGINE_VOICES.ferrari.banks.length, 8);
  assert.equal(ENGINE_VOICES.porsche.banks.length, 6);
  assert.notDeepEqual(ferrari, porsche);
  assert.notDeepEqual(ferrari, hellcat);
  assert.notDeepEqual(porsche, hellcat);
  assert.ok(ENGINE_VOICES.hellcat.whine.level > 0);
});

test('the new presets use different firing patterns and distinguish Demon boost from Hellcat', () => {
  const presets = [['countach', 12], ['huracan', 10], ['demon', 8], ['subaru', 4]] as const;
  for (const [id, cylinders] of presets) {
    const voice = ENGINE_VOICES[id];
    assert.equal(voice.banks.length, cylinders);
    assert.equal(voice.timing.length, cylinders);
    assert.equal(voice.pulseStrength.length, cylinders);
    assert.ok(VOICE_IDS.includes(id));
  }
  assert.ok(ENGINE_VOICES.demon.whine.level > ENGINE_VOICES.hellcat.whine.level);
  assert.ok(ENGINE_VOICES.demon.whine.rpmRatio > ENGINE_VOICES.hellcat.whine.rpmRatio);
  assert.ok(ENGINE_VOICES.subaru.whine.level < ENGINE_VOICES.hellcat.whine.level);
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

test('the S85 and 2JZ presets retain the correct cylinder counts and distinct exhaust cycles', () => {
  assert.equal(ENGINE_VOICES.m5.banks.length, 10);
  assert.equal(VEHICLES.m5.engine.limiterRpm, 8250);
  assert.equal(ENGINE_VOICES.supra.banks.length, 6);
  assert.notDeepEqual(makeEngineWave(3600, 'm5'), makeEngineWave(3600, 'huracan'));
  assert.notDeepEqual(makeEngineWave(3600, 'supra'), makeEngineWave(3600, 'porsche'));
});

test('Supra boost rises in stages with RPM and falls on throttle lift', () => {
  assert.equal(supraBoostTarget(780, 1), 0);
  assert.ok(supraBoostTarget(3200, 1) > 0);
  assert.ok(supraBoostTarget(4700, 1) > supraBoostTarget(3900, 1));
  assert.equal(supraBoostTarget(6500, 1), 1);
  assert.equal(supraBoostTarget(6500, 0.1), 0);
});
