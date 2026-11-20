export const IDLE_RPM = 780;
export const REDLINE_RPM = 6_800;
export const SPEED_TIMEOUT_MS = 1_250;
const GEAR_RATIOS = [3.13, 2.07, 1.52, 1.18, 0.92, 0.73];
const FINAL_DRIVE = 3.73;
const TYRE_CIRCUMFERENCE_M = 2.08;
const LOW_SPEED_KMH = 1.5;
const SHIFT_LOCK_MS = 380;
const UPSHIFT_MS = 155;
const DOWNSHIFT_MS = 215;

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

function wheelRpm(speedKmh: number, gear: number) {
  return speedKmh * 1000 / (60 * TYRE_CIRCUMFERENCE_M) * FINAL_DRIVE * GEAR_RATIOS[gear - 1];
}

function smoothstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export type Transmission = { gear: number; shiftedAtMs: number; fromGear?: number };
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
  redlineRpm = REDLINE_RPM,
  shiftTimeScale = 1,
): DriveTarget {
  const age = tracking ? Math.max(0, now - tracking.atMs) : Infinity;
  if (!tracking || age >= SPEED_TIMEOUT_MS) {
    return { gear: 1, shiftedAtMs: -Infinity, rpm: IDLE_RPM, load: 0.08, overrun: 0, shift: null, fresh: false };
  }

  const acceleration = Math.sign(tracking.accelerationMps2) * Math.max(0, Math.abs(tracking.accelerationMps2) - 0.18);
  const freshness = clamp((500 - age) / 300, 0, 1);
  const leadSeconds = (0.19 + Math.min(age, 140) / 1000) * freshness;
  const correctionKmh = clamp(acceleration * leadSeconds * 3.6, -6, 6);
  const speed = tracking.measuredKmh < LOW_SPEED_KMH ? 0 : Math.max(0, tracking.filteredKmh + correctionKmh);
  const load = speed === 0 ? 0.08 : clamp(0.18 + acceleration * freshness / 4.1 + speed / 650, 0.07, 1);
  const overrun = speed > 8 ? clamp((-acceleration - 0.2) * freshness / 2.2, 0, 1) : 0;
  const shiftScale = redlineRpm / REDLINE_RPM;
  const upAt = (3_450 + load * 2_850) * shiftScale;
  const downAt = (1_580 + load * 980 + overrun * 260) * shiftScale;
  let gear = previous?.gear ?? 1;
  let shiftedAtMs = previous?.shiftedAtMs ?? -Infinity;
  let fromGear = previous?.fromGear;

  if (speed === 0) {
    gear = 1;
    shiftedAtMs = -Infinity;
    fromGear = undefined;
  } else if (!previous) {
    while (gear < GEAR_RATIOS.length && wheelRpm(speed, gear) > upAt) gear++;
  } else if (age <= 400 && now - shiftedAtMs >= SHIFT_LOCK_MS) {
    if (gear < GEAR_RATIOS.length && wheelRpm(speed, gear) > upAt) {
      fromGear = gear;
      gear++;
      shiftedAtMs = now;
    } else if (gear > 1 && wheelRpm(speed, gear) < downAt && wheelRpm(speed, gear - 1) < upAt - 400) {
      fromGear = gear;
      gear--;
      shiftedAtMs = now;
    }
  }

  const lockedRpm = wheelRpm(speed, gear);
  const launchBlend = gear === 1 ? smoothstep(speed / 14) : 1;
  const launchRpm = IDLE_RPM + Math.max(0, acceleration) * 140 * smoothstep(speed / 4);
  let rpm = lockedRpm * launchBlend + launchRpm * (1 - launchBlend);
  let shapedLoad = load;
  let shift: DriveTarget['shift'] = null;
  if (fromGear !== undefined) {
    const elapsed = (now - shiftedAtMs) / shiftTimeScale;
    if (fromGear < gear && elapsed < UPSHIFT_MS) {
      shift = 'up';
      const blend = smoothstep((elapsed - 12) / 115);
      rpm = wheelRpm(speed, fromGear) * (1 - blend) + lockedRpm * blend;
      shapedLoad *= 0.20 + 0.80 * smoothstep((elapsed - 35) / 120);
    } else if (fromGear > gear && elapsed < DOWNSHIFT_MS) {
      shift = 'down';
      const blend = smoothstep(elapsed / 130);
      rpm = wheelRpm(speed, fromGear) * (1 - blend) + lockedRpm * blend;
      // A brief rev-match raises the RPM and opens the throttle during engagement.
      const blip = Math.sin(Math.PI * clamp(elapsed / DOWNSHIFT_MS, 0, 1));
      rpm += 265 * blip ** 3;
      shapedLoad = Math.max(load, 0.52 * blip ** 2);
    } else {
      fromGear = undefined;
    }
  }
  return {
    gear,
    shiftedAtMs,
    fromGear,
    rpm: clamp(rpm, IDLE_RPM, redlineRpm),
    load: shapedLoad,
    overrun: shift === 'down' ? overrun * (1 - shapedLoad) : overrun,
    shift,
    fresh: true,
  };
}
