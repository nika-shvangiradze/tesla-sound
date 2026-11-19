export const IDLE_RPM = 780;
export const REDLINE_RPM = 6_800;
export const SPEED_TIMEOUT_MS = 1_250;
const GEAR_RATIOS = [3.13, 2.07, 1.52, 1.18, 0.92, 0.73];
const FINAL_DRIVE = 3.73;
const TYRE_CIRCUMFERENCE_M = 2.08;
const LOW_SPEED_KMH = 1.5;
const SHIFT_LOCK_MS = 380;

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

  const filteredKmh = previous.filteredKmh + (speedKmh - previous.filteredKmh) * (1 - Math.exp(-dt / 0.085));
  const derivative = clamp((filteredKmh - previous.filteredKmh) / (3.6 * dt), -10, 7);
  const accelerationMps2 = previous.accelerationMps2 + (derivative - previous.accelerationMps2) *
    (1 - Math.exp(-dt / 0.24));
  return { atMs, measuredKmh: speedKmh, filteredKmh, accelerationMps2 };
}

function wheelRpm(speedKmh: number, gear: number) {
  return speedKmh * 1000 / (60 * TYRE_CIRCUMFERENCE_M) * FINAL_DRIVE * GEAR_RATIOS[gear - 1];
}

export type Transmission = { gear: number; shiftedAtMs: number };
export type DriveTarget = Transmission & { rpm: number; load: number; fresh: boolean };

export function driveTarget(tracking: SpeedTracking | null, previous: Transmission | null, now: number): DriveTarget {
  const age = tracking ? Math.max(0, now - tracking.atMs) : Infinity;
  if (!tracking || age >= SPEED_TIMEOUT_MS) {
    return { gear: 1, shiftedAtMs: -Infinity, rpm: IDLE_RPM, load: 0.08, fresh: false };
  }

  const acceleration = Math.abs(tracking.accelerationMps2) >= 0.28 ? tracking.accelerationMps2 : 0;
  const freshness = clamp((500 - age) / 300, 0, 1);
  const leadSeconds = (0.16 + Math.min(age, 140) / 1000) * freshness;
  const correctionKmh = clamp(acceleration * leadSeconds * 3.6, -6, 6);
  const speed = tracking.measuredKmh < LOW_SPEED_KMH ? 0 : Math.max(0, tracking.filteredKmh + correctionKmh);
  const load = speed === 0 ? 0.08 : clamp(0.16 + acceleration * freshness / 4.8 + speed / 560, 0.08, 1);
  const upAt = 3_850 + load * 2_450;
  const downAt = 1_600 + load * 650;
  let gear = previous?.gear ?? 1;
  let shiftedAtMs = previous?.shiftedAtMs ?? -Infinity;

  if (speed === 0) {
    gear = 1;
    shiftedAtMs = -Infinity;
  } else if (!previous) {
    while (gear < GEAR_RATIOS.length && wheelRpm(speed, gear) > upAt) gear++;
  } else if (now - shiftedAtMs >= SHIFT_LOCK_MS) {
    if (gear < GEAR_RATIOS.length && wheelRpm(speed, gear) > upAt) {
      gear++;
      shiftedAtMs = now;
    } else if (gear > 1 && wheelRpm(speed, gear) < downAt && wheelRpm(speed, gear - 1) < upAt - 400) {
      gear--;
      shiftedAtMs = now;
    }
  }

  const shiftLoad = 0.34 + 0.66 * clamp((now - shiftedAtMs) / 190, 0, 1);
  return {
    gear,
    shiftedAtMs,
    rpm: clamp(wheelRpm(speed, gear), IDLE_RPM, REDLINE_RPM),
    load: load * shiftLoad,
    fresh: true,
  };
}
