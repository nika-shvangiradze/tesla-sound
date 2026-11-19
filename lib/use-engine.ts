'use client';

import { useEffect, useRef, useState } from 'react';
import { clamp, driveTarget, IDLE_RPM, REDLINE_RPM, SPEED_TIMEOUT_MS, trackSpeed } from './drive-model';
import type { SpeedTracking, Transmission } from './drive-model';
import { EngineAudio, type AudioPath } from './engine-audio';
import { makeFix, OPTIONS } from './gps';

export type EngineMode = 'manual' | 'gps';
type AudioStatus = 'off' | 'starting' | 'playing' | 'paused' | 'error';
type Frame = { rpm: number; load: number; gear: number | null; speed: number | null; gpsStatus: string };
type Gps = { tracking: SpeedTracking | null; issue: string | null };
type Session = { audio: EngineAudio; timer?: number; resuming: boolean; preferWorklet: boolean };

const emptyFrame: Frame = { rpm: IDLE_RPM, load: 0, gear: null, speed: null, gpsStatus: 'GPS standby' };
const newGps = (): Gps => ({ tracking: null, issue: null });

export function useEngine() {
  const [mode, renderMode] = useState<EngineMode>('manual');
  const [manualRpm, renderManualRpm] = useState(IDLE_RPM);
  const [volume, renderVolume] = useState(36);
  const [preferWorklet, setPreferWorklet] = useState(false);
  const [state, setState] = useState<AudioStatus>('off');
  const [path, setPath] = useState<AudioPath>('standard');
  const [error, setError] = useState('');
  const [frame, setFrame] = useState(emptyFrame);
  const controls = useRef({ mode, manualRpm, volume, revUntil: 0 });
  const gps = useRef<Gps>(newGps());
  const session = useRef<Session | null>(null);
  const active = state === 'playing' || state === 'paused';

  useEffect(() => {
    function suspendOnHide() {
      if (document.hidden && session.current) stop();
    }
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', suspendOnHide);
    return () => {
      window.removeEventListener('pagehide', stop);
      document.removeEventListener('visibilitychange', suspendOnHide);
      dispose();
    };
  }, []);

  useEffect(() => {
    if (!active || mode !== 'gps') return;
    const current = gps.current;
    if (!window.isSecureContext || !navigator.geolocation) {
      current.issue = window.isSecureContext ? 'GPS unavailable' : 'GPS requires HTTPS';
      return;
    }
    let alive = true;
    let watchId: number | undefined;
    try {
      watchId = navigator.geolocation.watchPosition((position) => {
        if (!alive) return;
        const now = performance.now();
        const fix = makeFix(position, Date.now(), now);
        if (fix.speedKmh === null) {
          current.issue = 'Speed unavailable';
          return;
        }
        if (fix.dataAgeMs !== null && fix.dataAgeMs >= SPEED_TIMEOUT_MS) {
          current.issue = 'Waiting for fresh GPS speed';
          return;
        }
        current.tracking = trackSpeed(fix.speedKmh, now, current.tracking);
        current.issue = null;
      }, (failure) => {
        if (!alive) return;
        current.issue = failure.code === 1 ? 'Location permission denied'
          : failure.code === 3 ? 'GPS timed out' : 'GPS position unavailable';
        if (failure.code === 1) {
          current.tracking = null;
          if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
          watchId = undefined;
        }
      }, OPTIONS);
    } catch {
      current.issue = 'Could not start GPS';
    }
    return () => {
      alive = false;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [active, mode]);

  function dispose() {
    const current = session.current;
    session.current = null;
    if (!current) return;
    window.clearInterval(current.timer);
    current.audio.stop();
  }

  function stop() {
    dispose();
    gps.current = newGps();
    controls.current.revUntil = 0;
    setFrame(emptyFrame);
    setState('off');
    setError('');
  }

  function runAudio(current: Session) {
    let last = performance.now();
    let lastDisplay = -Infinity;
    let rpm = IDLE_RPM;
    let transmission: Transmission | null = null;
    let previousMode: EngineMode | undefined;
    function tick() {
      const now = performance.now();
      const dt = clamp((now - last) / 1000, 0, 0.12);
      last = now;
      const input = controls.current;
      if (input.mode !== previousMode) transmission = null;
      previousMode = input.mode;
      const inDrive = input.mode === 'gps';
      const reading = gps.current;
      const drive = inDrive ? driveTarget(reading.tracking, transmission, now) : null;
      transmission = drive?.fresh ? drive : null;
      const revving = now < input.revUntil;
      const targetRpm = drive?.rpm ?? (revving ? REDLINE_RPM - 260 : input.manualRpm);
      const delta = targetRpm - rpm;
      const relax = inDrive ? 0.085 : targetRpm > rpm ? 0.16 : 0.22;
      rpm += delta * (1 - Math.exp(-dt / relax));
      if (Math.abs(targetRpm - rpm) < 2) rpm = targetRpm;
      const load = drive?.load ?? (revving ? 0.97
        : clamp(0.1 + (rpm - IDLE_RPM) / 15_000 + Math.max(0, delta) / 6_000, 0.08, 1));
      const gpsStatus = !inDrive ? 'GPS standby'
        : drive?.fresh ? 'Receiving GPS speed'
        : reading.issue ?? (reading.tracking ? 'GPS delayed · idling' : 'Waiting for GPS speed');
      current.audio.update(rpm, load, input.volume / 100);
      if (now - lastDisplay >= 65) {
        lastDisplay = now;
        setFrame({
          rpm: Math.round(rpm), load, gear: drive?.fresh ? drive.gear : null,
          speed: drive?.fresh ? reading.tracking?.measuredKmh ?? null : null, gpsStatus,
        });
      }
    }
    tick();
    current.timer = window.setInterval(tick, 33);
  }

  async function start() {
    let current = session.current;
    if (current?.resuming || current?.audio.context.state === 'running') return;
    setError('');
    setState('starting');
    try {
      if (!current) {
        current = { audio: new EngineAudio(), resuming: false, preferWorklet };
        session.current = current;
        setPath('standard');
      }
      const starting = current;
      starting.resuming = true;
      await starting.audio.resume();
      if (session.current !== starting) return;
      starting.resuming = false;
      setState('playing');
      if (starting.timer === undefined) {
        starting.audio.context.onstatechange = () => {
          if (session.current === starting && !starting.resuming) {
            setState(starting.audio.context.state === 'running' ? 'playing' : 'paused');
          }
        };
        runAudio(starting);
        if (starting.preferWorklet) void starting.audio.enableWorklet(setPath);
      }
    } catch (failure) {
      if (session.current !== current) return;
      dispose();
      gps.current = newGps();
      setFrame(emptyFrame);
      setState('error');
      setError(failure instanceof Error ? failure.message : 'Sound could not start.');
    }
  }

  function setMode(next: EngineMode) {
    if (controls.current.mode === next) return;
    controls.current.mode = next;
    controls.current.revUntil = 0;
    gps.current = newGps();
    setFrame((previous) => ({ ...previous, gear: null, speed: null,
      gpsStatus: next === 'gps' && session.current ? 'Waiting for GPS speed' : 'GPS standby' }));
    renderMode(next);
  }

  return {
    mode, manualRpm, volume, preferWorklet, state, path, error, frame, start, stop, setMode, setPreferWorklet,
    setManualRpm(value: number) {
      controls.current.manualRpm = value;
      renderManualRpm(value);
    },
    setVolume(value: number) {
      controls.current.volume = value;
      renderVolume(value);
    },
    rev() { controls.current.revUntil = performance.now() + 720; },
  };
}
