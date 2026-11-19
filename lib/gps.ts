export const STALE_MS = 5_000;
export const FIRST_FIX_MS = 12_000;
const EPOCH_TOLERANCE_MS = 24 * 60 * 60 * 1000;
export const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 10_000,
};

export type Fix = {
  receivedAtMs: number;
  elapsedMs: number;
  rawPositionTimestamp: number | null;
  positionTimestampMs: number | null;
  dataAgeMs: number | null;
  callbackIntervalMs: number | null;
  positionIntervalMs: number | null;
  speedKmh: number | null;
  accuracyM: number | null;
};

export function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function positionTiming(rawPositionTimestamp: number | null, receivedAtMs: number, previousTimestampMs?: number | null) {
  // A live, uncached position should be close to the browser's wall clock.
  // Only convert microseconds when the result is recognizable as epoch time.
  let positionTimestampMs: number | null = null;
  if (rawPositionTimestamp !== null && rawPositionTimestamp > 0) {
    if (Math.abs(receivedAtMs - rawPositionTimestamp) <= EPOCH_TOLERANCE_MS) {
      positionTimestampMs = rawPositionTimestamp;
    } else if (Math.abs(receivedAtMs - rawPositionTimestamp / 1000) <= EPOCH_TOLERANCE_MS) {
      positionTimestampMs = rawPositionTimestamp / 1000;
    }
  }
  return {
    rawPositionTimestamp,
    positionTimestampMs,
    dataAgeMs: positionTimestampMs === null ? null : receivedAtMs - positionTimestampMs,
    positionIntervalMs: positionTimestampMs !== null && previousTimestampMs != null
      ? positionTimestampMs - previousTimestampMs : null,
  };
}

export function makeFix(position: GeolocationPosition, receivedAtMs: number, elapsedMs: number, previous?: Fix): Fix {
  const speed = finite(position.coords.speed);
  const accuracy = finite(position.coords.accuracy);
  return {
    receivedAtMs,
    elapsedMs,
    ...positionTiming(finite(position.timestamp), receivedAtMs, previous?.positionTimestampMs),
    callbackIntervalMs: previous ? elapsedMs - previous.elapsedMs : null,
    speedKmh: speed !== null && speed >= 0 ? finite(speed * 3.6) : null,
    accuracyM: accuracy !== null && accuracy >= 0 ? accuracy : null,
  };
}

export function gapReason(last: Fix | undefined, elapsedMs: number): string | null {
  if (!last) return elapsedMs >= FIRST_FIX_MS ? 'No GPS fix received within 12 s.' : null;
  const sinceCallback = elapsedMs - last.elapsedMs;
  if (sinceCallback >= STALE_MS) return 'No GPS callback for at least 5 s.';
  if (last.dataAgeMs !== null && last.dataAgeMs >= 0 && last.dataAgeMs + sinceCallback >= STALE_MS) {
    return 'The latest position timestamp is at least 5 s old.';
  }
  return null;
}
