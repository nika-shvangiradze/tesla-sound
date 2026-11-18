'use client';

import { useEffect, useRef, useState } from 'react';
import { probeAudio } from './audio-probe';
import { errorText, exportRun, initialCapabilities, inspectBrowser, vector } from './diagnostic';
import type { Capabilities, EventEntry, Run, Signal } from './diagnostic';
import { gapReason, makeFix, OPTIONS } from './gps';
import type { Fix } from './gps';

const HISTORY_MS = 60_000;
const MAX_DISPLAY_EVENTS = 30;
const MOTION_WAIT_MS = 6_000;

function viewOf(run: Run) {
  let first = run.fixes.length;
  while (first > 0 && run.fixes[first - 1].elapsedMs >= run.durationMs - HISTORY_MS) first--;
  return {
    active: run.stoppedAtMs === null,
    signal: run.signal,
    capabilities: run.capabilities,
    elapsed: run.durationMs,
    sampleCount: run.fixes.length,
    latest: run.fixes[run.fixes.length - 1] as Fix | undefined,
    history: run.fixes.slice(first),
    events: run.events.slice(-MAX_DISPLAY_EVENTS),
    hasRun: true,
  };
}

export function useDiagnostic() {
  const [view, setView] = useState<ReturnType<typeof viewOf>>({
    active: false, signal: 'standby', capabilities: initialCapabilities, elapsed: 0,
    sampleCount: 0, latest: undefined, history: [], events: [], hasRun: false,
  });
  const session = useRef<Run | null>(null);
  const stopRef = useRef<((publish?: boolean) => void) | null>(null);

  useEffect(() => {
    setView((current) => current.hasRun ? current : { ...current, capabilities: inspectBrowser() });
    return () => stopRef.current?.(false);
  }, []);

  function start() {
    if (stopRef.current) return;

    const startedAtMs = Date.now();
    const startedAtTick = performance.now();
    const elapsed = () => performance.now() - startedAtTick;
    const abort = new AbortController();
    const run: Run = {
      startedAtMs, stoppedAtMs: null, durationMs: 0, userAgent: navigator.userAgent,
      signal: 'acquiring', capabilities: inspectBrowser(), fixes: [], events: [],
    };
    session.current = run;
    const cleanup: Array<() => void> = [];
    let watchId: number | undefined;
    let gpsTerminal = false;
    let signalLostLogged = false;
    let gpsError: number | undefined;

    function publish() {
      if (!abort.signal.aborted) {
        run.durationMs = elapsed();
        setView(viewOf(run));
      }
    }

    function update(patch: Partial<Capabilities>) {
      if (!abort.signal.aborted) run.capabilities = { ...run.capabilities, ...patch };
    }

    function log(kind: EventEntry['kind'], message: string, gpsErrorCode?: number) {
      if (abort.signal.aborted) return;
      run.events.push({ kind, message, gpsErrorCode, atMs: Date.now(), elapsedMs: elapsed() });
    }

    function clearWatch() {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
        watchId = undefined;
      }
    }

    function finish(shouldPublish = true) {
      log('info', 'Test stopped.');
      run.durationMs = elapsed();
      run.stoppedAtMs = Date.now();
      const { motion, motionEventCount, audio, worklet } = run.capabilities;
      if (motion === 'testing') update({ motion: motionEventCount ? 'no data' : 'cancelled' });
      if (audio === 'testing') update({ audio: 'cancelled' });
      if (worklet === 'testing') update({ worklet: 'cancelled' });
      abort.abort();
      clearWatch();
      cleanup.forEach((dispose) => dispose());
      stopRef.current = null;
      if (shouldPublish) setView(viewOf(run));
    }

    stopRef.current = finish;
    log('info', 'Test started.');

    const onVisibility = () => {
      log('info', `Page visibility: ${document.visibilityState}.`);
      publish();
    };
    const onPageHide = () => finish();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility));
    cleanup.push(() => window.removeEventListener('pagehide', onPageHide));

    const interval = window.setInterval(() => {
      const reason = !gpsTerminal && gapReason(run.fixes[run.fixes.length - 1], elapsed());
      if (reason && !signalLostLogged) {
        run.signal = 'signal lost';
        signalLostLogged = true;
        log('warning', reason);
      }
      publish();
    }, 250);
    cleanup.push(() => window.clearInterval(interval));

    const Motion = window.DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<PermissionState> };
    if (run.capabilities.motion === 'available') {
      update({ motion: 'testing' });
      function listenForMotion() {
        if (abort.signal.aborted) return;
        const onMotion = (event: DeviceMotionEvent) => {
          const acceleration = vector(event.acceleration);
          const accelerationIncludingGravity = vector(event.accelerationIncludingGravity);
          const hasSample = !!(acceleration || accelerationIncludingGravity);
          const { motionEventCount, accelerationSampleCount, motion } = run.capabilities;
          if (hasSample && motion !== 'verified') log('success', 'DeviceMotion delivered accelerometer values.');
          update({
            motionEventCount: motionEventCount + 1,
            accelerationSampleCount: accelerationSampleCount + Number(hasSample),
            ...(hasSample ? {
              motion: 'verified' as const, acceleration, accelerationIncludingGravity,
            } : {}),
          });
        };
        window.addEventListener('devicemotion', onMotion);
        cleanup.push(() => window.removeEventListener('devicemotion', onMotion));
        const timeout = window.setTimeout(() => {
          if (run.capabilities.motion === 'verified') return;
          update({ motion: 'no data' });
          log('warning', run.capabilities.motionEventCount
            ? 'DeviceMotion events contained no accelerometer values.'
            : 'No DeviceMotion events within 6 s.');
          publish();
        }, MOTION_WAIT_MS);
        cleanup.push(() => window.clearTimeout(timeout));
      }

      if (typeof Motion.requestPermission === 'function') {
        // Invoke in the Start click so permission retains user activation.
        try {
          void Motion.requestPermission().then((permission) => {
            if (permission === 'granted') listenForMotion();
            else {
              update({ motion: 'blocked' });
              log('warning', 'DeviceMotion permission was denied.');
              publish();
            }
          }).catch(onMotionError);
        } catch (error) {
          onMotionError(error);
        }
      } else listenForMotion();
    }

    function onMotionError(error: unknown) {
      update({ motion: error instanceof Error && error.name === 'NotAllowedError' ? 'blocked' : 'error' });
      log('warning', `DeviceMotion: ${errorText(error)}`);
      publish();
    }

    void probeAudio(abort.signal, (patch) => { update(patch); publish(); }, log);

    if (run.capabilities.geolocation !== 'available') {
      gpsTerminal = true;
      run.signal = 'unavailable';
      log('error', run.capabilities.secure ? 'Geolocation API is unavailable.' : 'Geolocation needs HTTPS or localhost.');
      publish();
      return;
    }

    const permissions = navigator.permissions;
    if (typeof permissions?.query === 'function') {
      void (async () => {
        try {
          const status = await permissions.query({ name: 'geolocation' });
          if (abort.signal.aborted) return;
          const onChange = () => { update({ permission: status.state }); publish(); };
          onChange();
          status.addEventListener('change', onChange);
          cleanup.push(() => status.removeEventListener('change', onChange));
        } catch {
          if (run.capabilities.permission === 'unknown') update({ permission: 'unavailable' });
        }
      })();
    }

    try {
      watchId = navigator.geolocation.watchPosition((position) => {
        if (abort.signal.aborted || gpsTerminal) return;
        const at = Date.now();
        const tick = elapsed();
        const previous = run.fixes[run.fixes.length - 1];
        const fix = makeFix(position, at, tick, previous);
        run.fixes.push(fix);
        update({ geolocation: 'verified', permission: 'granted' });
        const reason = gapReason(fix, tick);
        if (reason) {
          run.signal = 'signal lost';
          if (!signalLostLogged) log('warning', reason);
          signalLostLogged = true;
        } else {
          if (signalLostLogged || gpsError !== undefined) log('success', 'GPS updates resumed.');
          else if (!previous) log('success', 'First GPS fix received.');
          signalLostLogged = false;
          run.signal = 'receiving';
        }
        gpsError = undefined;
        publish();
      }, (error) => {
        if (abort.signal.aborted || gpsTerminal) return;
        const labels: Record<number, string> = { 1: 'Permission denied', 2: 'Position unavailable', 3: 'Position timed out' };
        log('error', `GPS: ${labels[error.code] ?? 'Unknown error'}${error.message ? ` · ${error.message}` : ''}.`, error.code);
        gpsError = error.code;
        if (error.code === 1) {
          update({ permission: 'denied' });
          run.signal = 'denied';
          gpsTerminal = true;
          clearWatch();
        } else if (error.code === 2 && run.fixes.length) {
          run.signal = 'signal lost';
          signalLostLogged = true;
        }
        publish();
      }, OPTIONS);
    } catch (error) {
      gpsTerminal = true;
      run.signal = 'failed';
      log('error', `GPS: ${errorText(error)}`);
    }
    publish();
  }

  return {
    view, start, stop: () => stopRef.current?.(),
    getExport: () => session.current ? exportRun(session.current) : null,
  };
}
