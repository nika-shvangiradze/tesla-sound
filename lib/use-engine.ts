'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp, driveTarget, SPEED_TIMEOUT_MS, trackSpeed } from './drive-model';
import type { DriveTarget, SimulatedGear, SpeedTracking, Transmission } from './drive-model';
import { EngineAudio, type AudioPath } from './engine-audio';
import { DEFAULT_VOICE, type VoiceId } from './engine-wave';
import { makeFix, OPTIONS } from './gps';
import { VEHICLES } from './vehicle-profiles';

export type EngineMode = 'manual' | 'gps';
type AudioStatus = 'off' | 'starting' | 'playing' | 'paused' | 'error';
type Frame = { rpm: number; load: number; gear: SimulatedGear | null; speed: number | null; gpsStatus: string; shift: DriveTarget['shift'] };
type Gps = { tracking: SpeedTracking | null; issue: string | null };
type Session = { audio: EngineAudio; resuming: boolean; preferWorklet: boolean; started: boolean };
type Simulation = { rpm: number; last: number; lastDisplay: number; transmission: Transmission | null; voice: VoiceId; mode: EngineMode };

const idleRpm = VEHICLES[DEFAULT_VOICE].engine.idleRpm;
const emptyFrame: Frame = { rpm: idleRpm, load: 0, gear: 'N', speed: null, gpsStatus: 'GPS standby', shift: null };
const newGps = (): Gps => ({ tracking: null, issue: null });

export function useEngine() {
  const [mode, renderMode] = useState<EngineMode>('manual');
  const [manualRpm, renderManualRpm] = useState(idleRpm);
  const [volume, renderVolume] = useState(36);
  const [preferWorklet, setPreferWorklet] = useState(false);
  const [voice, renderVoice] = useState<VoiceId>(DEFAULT_VOICE);
  const [state, setState] = useState<AudioStatus>('off');
  const [path, setPath] = useState<AudioPath>('standard');
  const [error, setError] = useState('');
  const [frame, setFrame] = useState(emptyFrame);
  const controls = useRef({ mode, manualRpm, volume, voice, revUntil: 0 });
  const gps = useRef<Gps>(newGps());
  const session = useRef<Session | null>(null);
  const simulation = useRef<Simulation>({ rpm: idleRpm, last: 0, lastDisplay: -Infinity, transmission: null, voice: DEFAULT_VOICE, mode: 'manual' });
  const active = state === 'playing' || state === 'paused';

  const step = useCallback((force = false, snap = false) => {
    const now = performance.now();
    const sim = simulation.current;
    const dt = clamp((now - sim.last) / 1_000, 0, 0.12);
    sim.last = now;
    const input = controls.current;
    const vehicle = VEHICLES[input.voice];
    const { idleRpm, limiterRpm, responseSeconds, revBlipRpm = limiterRpm - 260 } = vehicle.engine;
    const changed = input.mode !== sim.mode || input.voice !== sim.voice;
    if (changed) sim.transmission = null;
    sim.mode = input.mode;
    sim.voice = input.voice;

    const inDrive = input.mode === 'gps';
    const reading = gps.current;
    const drive = inDrive ? driveTarget(reading.tracking, sim.transmission, now, vehicle) : null;
    sim.transmission = drive?.fresh ? drive : null;
    const revving = !inDrive && now < input.revUntil;
    const target = drive?.rpm ?? (revving ? Math.max(input.manualRpm, revBlipRpm) : input.manualRpm);
    const delta = target - sim.rpm;
    const response = drive ? drive.shift ? 0.032 : drive.fresh ? 0.045 : 0.16
      : delta >= 0 ? responseSeconds : responseSeconds * 1.45;
    if (changed || snap || Math.abs(delta) < 2) sim.rpm = target;
    else sim.rpm += delta * (1 - Math.exp(-dt / response));
    sim.rpm = clamp(sim.rpm, idleRpm, limiterRpm);
    const rpm = Math.round(sim.rpm);
    const load = drive?.load ?? (revving ? 0.97
      : clamp(0.1 + (rpm - idleRpm) / 15_000 + (changed || snap ? 0 : Math.max(0, delta) / 6_000), 0.08, 1));
    const gpsStatus = !inDrive ? 'GPS standby'
      : drive?.fresh ? 'Receiving GPS speed'
      : reading.issue ?? (reading.tracking ? 'GPS delayed · idling' : 'Waiting for GPS speed');
    const lift = !inDrive && !changed && !snap && delta < -150 ? clamp(-delta / 3800, 0, 1) : 0;
    const sound = session.current;
    if (sound?.started) sound.audio.update(rpm, load, input.volume / 100, input.voice, drive?.overrun ?? lift);

    if (changed || force || now - sim.lastDisplay >= 33) {
      sim.lastDisplay = now;
      setFrame({
        rpm, load, gear: inDrive ? drive?.fresh ? drive.gear : null : 'N',
        speed: drive?.fresh ? reading.tracking?.measuredKmh ?? null : null,
        gpsStatus, shift: drive?.shift ?? null,
      });
    }
  }, []);

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
    if (mode !== 'gps') return;
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
  }, [mode]);

  useEffect(() => {
    if (!active && mode !== 'gps') return;
    step(true);
    const timer = window.setInterval(step, 20);
    return () => window.clearInterval(timer);
  }, [active, mode, step]);

  function dispose() {
    const current = session.current;
    session.current = null;
    if (!current) return;
    current.audio.stop();
  }

  function stop() {
    dispose();
    controls.current.revUntil = 0;
    step(true, controls.current.mode === 'manual');
    setState('off');
    setError('');
  }

  async function start() {
    let current = session.current;
    if (current?.resuming || current?.audio.context.state === 'running') return;
    setError('');
    setState('starting');
    try {
      if (!current) {
        current = { audio: new EngineAudio(controls.current.voice), resuming: false, preferWorklet, started: false };
        session.current = current;
        setPath('standard');
      }
      const starting = current;
      starting.resuming = true;
      await starting.audio.resume();
      if (session.current !== starting) return;
      starting.resuming = false;
      setState('playing');
      if (!starting.started) {
        starting.started = true;
        starting.audio.context.onstatechange = () => {
          if (session.current === starting && !starting.resuming) {
            setState(starting.audio.context.state === 'running' ? 'playing' : 'paused');
          }
        };
        if (starting.preferWorklet) void starting.audio.enableWorklet(setPath);
      }
      step(true);
    } catch (failure) {
      if (session.current !== current) return;
      dispose();
      step(true, controls.current.mode === 'manual');
      setState('error');
      setError(failure instanceof Error ? failure.message : 'Sound could not start.');
    }
  }

  function setMode(next: EngineMode) {
    if (controls.current.mode === next) return;
    controls.current.mode = next;
    controls.current.revUntil = 0;
    gps.current = newGps();
    renderMode(next);
    step(true);
  }

  return {
    mode, manualRpm, volume, voice, preferWorklet, state, path, error, frame, start, stop, setMode, setPreferWorklet,
    setVoice(id: VoiceId) {
      const input = controls.current;
      if (input.voice === id) return;
      const next = VEHICLES[id].engine;
      input.manualRpm = input.manualRpm === VEHICLES[input.voice].engine.idleRpm
        ? next.idleRpm : clamp(input.manualRpm, next.idleRpm, next.limiterRpm);
      input.voice = id;
      input.revUntil = 0;
      renderManualRpm(input.manualRpm);
      renderVoice(id);
      step(true);
    },
    setManualRpm(value: number) {
      const input = controls.current;
      const { idleRpm, limiterRpm } = VEHICLES[input.voice].engine;
      input.manualRpm = clamp(value, idleRpm, limiterRpm);
      renderManualRpm(input.manualRpm);
      if (!session.current?.started) step(true, true);
    },
    setVolume(value: number) {
      controls.current.volume = value;
      renderVolume(value);
    },
    rev() { controls.current.revUntil = performance.now() + 720; },
  };
}
