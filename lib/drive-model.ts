import type { TransmissionType, VehicleProfile } from './vehicle-profiles';

export const SPEED_TIMEOUT_MS = 1_250;
const LOW_SPEED_KMH = 1.5;

// Shift maps, clutch/convertor behavior and timings are simulator tuning.
const SHIFT_MAPS: Record<TransmissionType, {
  upBase: number; upLoad: number; downBase: number; upMs: number; downMs: number;
  cut: number; revMatchRpm: number; launchKmh: number; neutralAtRest: boolean;
}> = {
  manual: { upBase: 0.37, upLoad: 0.49, downBase: 0.21, upMs: 280, downMs: 310, cut: 0.12, revMatchRpm: 260, launchKmh: 15, neutralAtRest: true },
  automatic: { upBase: 0.24, upLoad: 0.65, downBase: 0.17, upMs: 160, downMs: 200, cut: 0.45, revMatchRpm: 130, launchKmh: 20, neutralAtRest: false },
  'dual-clutch': { upBase: 0.32, upLoad: 0.60, downBase: 0.18, upMs: 95, downMs: 145, cut: 0.58, revMatchRpm: 200, launchKmh: 13, neutralAtRest: false },
  'automated-manual': { upBase: 0.36, upLoad: 0.54, downBase: 0.20, upMs: 175, downMs: 215, cut: 0.17, revMatchRpm: 300, launchKmh: 14, neutralAtRest: false },
  'race-manual': { upBase: 0.43, upLoad: 0.50, downBase: 0.24, upMs: 115, downMs: 165, cut: 0.10, revMatchRpm: 360, launchKmh: 24, neutralAtRest: true },
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export type SpeedTracking = {
  atMs: number;
  measuredKmh: number;
  filteredKmh: number;
  accelerationMps2: number;
};

export function trackSpeed(speedKmh: number, atMs: number, previous: SpeedTracking | null): SpeedTracking {
  const dt = previous ? (atMs - previous.atMs) / 1000 : 0;
  if (!previous || dt > SPEED_TIMEOUT_MS / 1000) {
    return { atMs, measuredKmh: speedKmh, filteredKmh: speedKmh, accelerationMps2: 0 };
  }
  if (dt <= 0) return previous;

  const filteredKmh = previous.filteredKmh + (speedKmh - previous.filteredKmh) * (1 - Math.exp(-dt / 0.070));
  const derivative = clamp((filteredKmh - previous.filteredKmh) / (3.6 * dt), -10, 7);
  const accelerationMps2 = previous.accelerationMps2 + (derivative - previous.accelerationMps2) *
    (1 - Math.exp(-dt / 0.24));
  return { atMs, measuredKmh: speedKmh, filteredKmh, accelerationMps2 };
}

export function engagedRpm(speedKmh: number, gear: number, gearbox: VehicleProfile['gearbox']) {
  return speedKmh * 1_000 / (60 * gearbox.circumferenceM) * gearbox.finalDrive * gearbox.ratios[gear - 1];
}

function smoothstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export type SimulatedGear = number | 'N';
export type Transmission = { gear: SimulatedGear; shiftedAtMs: number; fromGear?: number };
export type DriveTarget = Transmission & {
  rpm: number;
  load: number;
  overrun: number;
  shift: 'up' | 'down' | null;
  fresh: boolean;
};

export function driveTarget(
  tracking: SpeedTracking | null,
  previous: Transmission | null,
  now: number,
  vehicle: VehicleProfile,
): DriveTarget {
  const { engine, gearbox } = vehicle;
  const { idleRpm, limiterRpm, redlineRpm } = engine;
  const tune = SHIFT_MAPS[gearbox.type];
  const restGear = tune.neutralAtRest ? 'N' : 1;
  const resting = { gear: restGear, shiftedAtMs: -Infinity, rpm: idleRpm, load: 0.08, overrun: 0, shift: null } as const;
  const age = tracking ? Math.max(0, now - tracking.atMs) : Infinity;
  if (!tracking || age >= SPEED_TIMEOUT_MS) {
    return { ...resting, fresh: false };
  }
  if (tracking.measuredKmh < LOW_SPEED_KMH) return { ...resting, fresh: true };

  const acceleration = Math.sign(tracking.accelerationMps2) * Math.max(0, Math.abs(tracking.accelerationMps2) - 0.18);
  const freshness = clamp((500 - age) / 300, 0, 1);
  const leadSeconds = (0.19 + Math.min(age, 140) / 1000) * freshness;
  const correctionKmh = clamp(acceleration * leadSeconds * 3.6, -6, 6);
  const speed = Math.max(0, tracking.filteredKmh + correctionKmh);
  const load = clamp(0.11 + acceleration * freshness / 4.1 + speed / 3_000, 0.07, 1);
  const overrun = speed > 8 ? clamp((-acceleration - 0.2) * freshness / 2.2, 0, 1) : 0;
  const upAt = idleRpm + (redlineRpm - idleRpm) * (tune.upBase + load * tune.upLoad);
  const downAt = Math.max(idleRpm + 100, redlineRpm * (tune.downBase + load * 0.15 + overrun * 0.035));
  const lastGear = gearbox.ratios.length;
  const usablePrior = previous && typeof previous.gear === 'number' && previous.gear >= 1 && previous.gear <= lastGear ? previous : null;
  let gear = usablePrior && typeof usablePrior.gear === 'number' ? usablePrior.gear : 1;
  let shiftedAtMs = usablePrior?.shiftedAtMs ?? -Infinity;
  let fromGear = usablePrior?.fromGear;
  if (fromGear !== undefined && (fromGear < 1 || fromGear > lastGear)) fromGear = undefined;
  const rpmAt = (index: number) => engagedRpm(speed, index, gearbox);
  const shiftHold = Math.max(tune.upMs, tune.downMs) + 160;

  if (!usablePrior) {
    while (gear < lastGear && rpmAt(gear) > upAt) gear++;
  } else if (age <= 400 && now - shiftedAtMs >= shiftHold) {
    if (gear < lastGear && rpmAt(gear) > upAt) {
      fromGear = gear;
      gear++;
      shiftedAtMs = now;
    } else if (gear > 1 && rpmAt(gear) < downAt && rpmAt(gear - 1) < upAt - redlineRpm * 0.055) {
      fromGear = gear;
      gear--;
      shiftedAtMs = now;
    }
  }

  const lockedRpm = rpmAt(gear);
  const launchBlend = smoothstep(Math.min(speed / tune.launchKmh, lockedRpm / (idleRpm + 250)));
  const launchRpm = idleRpm + (load * 440 + Math.max(0, acceleration) * 120) * smoothstep(speed / 6);
  let rpm = lockedRpm * launchBlend + launchRpm * (1 - launchBlend);
  let shapedLoad = load;
  let shift: DriveTarget['shift'] = null;
  if (fromGear !== undefined) {
    const elapsed = now - shiftedAtMs;
    const beforeRpm = clamp(rpmAt(fromGear), idleRpm, limiterRpm);
    if (fromGear < gear && elapsed < tune.upMs) {
      shift = 'up';
      const blend = smoothstep(elapsed / tune.upMs);
      rpm = beforeRpm * (1 - blend) + rpm * blend;
      shapedLoad *= tune.cut + (1 - tune.cut) * blend;
    } else if (fromGear > gear && elapsed < tune.downMs) {
      shift = 'down';
      const blend = smoothstep(elapsed / tune.downMs);
      rpm = beforeRpm * (1 - blend) + rpm * blend;
      const blip = Math.sin(Math.PI * clamp(elapsed / tune.downMs, 0, 1));
      rpm += tune.revMatchRpm * blip ** 3;
      shapedLoad = Math.max(load, 0.52 * blip ** 2);
    } else {
      fromGear = undefined;
    }
  }
  return {
    gear,
    shiftedAtMs,
    fromGear,
    rpm: clamp(rpm, idleRpm, limiterRpm),
    load: shapedLoad,
    overrun: shift === 'down' ? overrun * (1 - shapedLoad) : overrun,
    shift,
    fresh: true,
  };
}
