import type { Fix } from './gps';
import { finite, OPTIONS, FIRST_FIX_MS, STALE_MS } from './gps';

export type ApiState = 'unchecked' | 'available' | 'unsupported' | 'insecure' | 'testing' | 'verified' | 'blocked' | 'no data' | 'error' | 'cancelled';
export type Signal = 'standby' | 'acquiring' | 'receiving' | 'signal lost' | 'denied' | 'unavailable' | 'failed';
export type EventEntry = {
  atMs: number;
  elapsedMs: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
  gpsErrorCode?: number;
};
export type Vector = { x: number | null; y: number | null; z: number | null };
export type Capabilities = {
  secure: boolean | null;
  geolocation: ApiState;
  permission: PermissionState | 'unknown' | 'unavailable';
  motion: ApiState;
  motionEventCount: number;
  accelerationSampleCount: number;
  acceleration: Vector | null;
  accelerationIncludingGravity: Vector | null;
  audio: ApiState;
  worklet: ApiState;
  audioContextState: string | null;
  sampleRateHz: number | null;
  baseLatencyMs: number | null;
  outputLatencyMs: number | null;
};

export type Run = {
  startedAtMs: number;
  stoppedAtMs: number | null;
  durationMs: number;
  userAgent: string;
  signal: Signal;
  capabilities: Capabilities;
  fixes: Fix[];
  events: EventEntry[];
};

export const initialCapabilities: Capabilities = {
  secure: null, geolocation: 'unchecked', permission: 'unknown',
  motion: 'unchecked', motionEventCount: 0, accelerationSampleCount: 0,
  acceleration: null, accelerationIncludingGravity: null,
  audio: 'unchecked', worklet: 'unchecked', audioContextState: null,
  sampleRateHz: null, baseLatencyMs: null, outputLatencyMs: null,
};

export type ProbeWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function inspectBrowser(): Capabilities {
  const secure = window.isSecureContext;
  const audio = typeof window.AudioContext === 'function' ||
    typeof (window as ProbeWindow).webkitAudioContext === 'function';
  return {
    ...initialCapabilities,
    secure,
    geolocation: !secure ? 'insecure' : navigator.geolocation ? 'available' : 'unsupported',
    permission: typeof navigator.permissions?.query === 'function' ? 'unknown' : 'unavailable',
    motion: !secure ? 'insecure' : typeof window.DeviceMotionEvent === 'function' ? 'available' : 'unsupported',
    audio: audio ? 'available' : 'unsupported',
    worklet: !secure ? 'insecure' : audio && typeof window.AudioWorkletNode === 'function' ? 'available' : 'unsupported',
  };
}

export function vector(value: DeviceMotionEventAcceleration | null): Vector | null {
  if (!value) return null;
  const result = { x: finite(value.x), y: finite(value.y), z: finite(value.z) };
  return result.x === null && result.y === null && result.z === null ? null : result;
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message || error.name : String(error);
}

export function exportRun(run: Run) {
  return JSON.stringify({
    app: 'VoltSound GPS Diagnostic',
    schemaVersion: '1.0.0',
    exportedAtMs: Date.now(),
    geolocationOptions: OPTIONS,
    firstFixThresholdMs: FIRST_FIX_MS,
    signalGapThresholdMs: STALE_MS,
    ...run,
  }, null, 2);
}
