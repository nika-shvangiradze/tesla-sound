'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiState, Vector } from '../lib/diagnostic';
import { useDiagnostic } from '../lib/use-diagnostic';
import SpeedChart from './speed-chart';

const units = { speed: 'km/h', time: 'ms', distance: 'm' };

function reading(value: number | null | undefined, decimals = 0) {
  return value == null ? '—' : value.toFixed(decimals);
}

function duration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function axes(value: Vector | null) {
  if (!value) return '—';
  return [value.x, value.y, value.z].map((v) => reading(v, 2)).join(' / ');
}

function Badge({ status }: { status: string }) {
  const good = ['verified', 'granted', 'secure', 'receiving'].includes(status);
  const warning = ['blocked', 'denied', 'error', 'failed', 'signal lost', 'insecure'].includes(status);
  return <span className={`badge ${good ? 'badge-good' : warning ? 'badge-warning' : ''}`}>{status}</span>;
}

function Capability({ name, status, children }: { name: string; status: ApiState | string; children: ReactNode }) {
  return (
    <div className="capability">
      <div className="flex items-center justify-between gap-3">
        <dt>{name}</dt><dd><Badge status={status} /></dd>
      </div>
      <dd className="capability-detail">{children}</dd>
    </div>
  );
}

export default function Dashboard() {
  const { view, start, stop, getExport } = useDiagnostic();
  const { active, latest, history, capabilities, events } = view;
  const [json, setJson] = useState<string | null>(null);
  const exportUrl = useRef<string | null>(null);
  useEffect(() => () => {
    if (exportUrl.current) URL.revokeObjectURL(exportUrl.current);
  }, []);

  function download() {
    const output = getExport();
    if (!output) return;
    setJson(output);
    if (exportUrl.current) URL.revokeObjectURL(exportUrl.current);
    try {
      exportUrl.current = URL.createObjectURL(new Blob([output], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = exportUrl.current;
      link.download = `voltsound-diagnostic-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      exportUrl.current = null;
    }
  }

  const metrics = [
    ['Update interval', latest?.callbackIntervalMs, units.time],
    ['Data age at receipt', latest?.dataAgeMs, units.time],
    ['Position accuracy', latest?.accuracyM, units.distance],
  ] as const;
  const speedSource = !latest ? 'No position fix received' :
    latest.speedKmh === null ? 'Speed unavailable in latest fix' :
    view.signal === 'signal lost' ? 'Last reported speed · signal lost' : 'Latest browser-reported speed';

  return (
    <div className="shell">
      <header className="topbar">
        <div className="wordmark"><span className="brand-mark" aria-hidden="true"><i /></span>Volt<span>Sound</span></div>
        <div className="topbar-meta"><span>MODEL 3 DIAGNOSTICS</span><span className="version">V1.0</span></div>
      </header>

      <main>
        <div className="intro">
          <div>
            <h1>GPS Diagnostic<span>.</span></h1>
            <p>Measure GPS timing and verify browser sensors and audio.</p>
          </div>
          <div className="actions" aria-label="Test controls">
            <button className="button primary" disabled={active} onClick={() => { setJson(null); start(); }}>
              <span className="play-icon" aria-hidden="true" />Start Test
            </button>
            <button className="button" disabled={!active} onClick={stop}>
              <span className="stop-icon" aria-hidden="true" />Stop Test
            </button>
            <button className="button" disabled={!view.hasRun} onClick={download}>
              <span className="export-icon" aria-hidden="true">↓</span>Export JSON
            </button>
          </div>
        </div>

        <div className="session-bar">
          <div className="flex items-center gap-3">
            <span className={`session-dot ${active ? 'session-dot-active' : ''}`} />
            <span role="status">{active ? 'Test running' : view.hasRun ? 'Test stopped' : 'Ready to test'}</span>
          </div>
          <div className="session-counts">
            <span><b>{duration(view.elapsed)}</b> elapsed</span>
            <span><b>{view.sampleCount}</b> GPS fixes</span>
          </div>
        </div>

        <div className="dashboard-grid">
          <section className="panel telemetry" aria-labelledby="telemetry">
            <div className="panel-heading">
              <h2 id="telemetry">GPS telemetry</h2>
              <div role="status" aria-label={`GPS status: ${view.signal}`}><Badge status={view.signal} /></div>
            </div>
            <div className="telemetry-readings">
              <div className="speed">
                <div className="metric-label">GPS speed</div>
                <div className="speed-reading"><strong>{reading(latest?.speedKmh, 1)}</strong><span>km/h</span></div>
                <div className="speed-source">{speedSource}</div>
              </div>
              <div className="metrics">
                {metrics.map(([label, value, unit]) => (
                  <div key={label} className="metric">
                    <div className="metric-label">{label}</div>
                    <div><strong>{reading(value)}</strong> <span>{unit}</span></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="chart-section">
              <div className="flex items-center justify-between gap-2">
                <h3>Speed history</h3><span className="chart-window">60 s · km/h</span>
              </div>
              <SpeedChart fixes={history} elapsed={view.elapsed} />
            </div>
          </section>

          <section className="panel browser-panel" aria-labelledby="browser">
            <div className="panel-heading"><h2 id="browser">Browser capabilities</h2></div>
            <dl className="capabilities">
              <Capability name="Secure context" status={capabilities.secure === null ? 'unchecked' : capabilities.secure ? 'secure' : 'insecure'}>
                {capabilities.secure === false ? 'Open using HTTPS or localhost.' : 'Required for geolocation and AudioWorklet.'}
              </Capability>
              <Capability name="Geolocation" status={capabilities.geolocation}>
                Permission <Badge status={capabilities.permission} />
              </Capability>
              <Capability name="DeviceMotion" status={capabilities.motion}>
                {capabilities.motion === 'verified'
                  ? `X / Y / Z: ${axes(capabilities.acceleration ?? capabilities.accelerationIncludingGravity)} m/s²${capabilities.acceleration ? '' : ' incl. gravity'}`
                  : `${capabilities.motionEventCount} events · ${capabilities.accelerationSampleCount} accelerometer samples`}
              </Capability>
              <Capability name="AudioContext" status={capabilities.audio}>
                {capabilities.sampleRateHz === null
                  ? 'Requires a Start Test tap.'
                  : `${capabilities.sampleRateHz} Hz · base ${reading(capabilities.baseLatencyMs, 1)} ms · output ${reading(capabilities.outputLatencyMs, 1)} ms`}
              </Capability>
              <Capability name="AudioWorklet" status={capabilities.worklet}>Silent render check</Capability>
            </dl>
          </section>
        </div>

        <section className="panel event-panel" aria-labelledby="events">
          <div className="panel-heading">
            <h2 id="events">Event log</h2>
            <span className="chart-window">Latest 30 events</span>
          </div>
          {events.length ? (
            <ol className="event-list">
              {events.slice().reverse().map((event, index) => (
                <li key={`${event.elapsedMs}-${index}`}>
                  <span className="event-time">{duration(event.elapsedMs)}</span>
                  <span className={`event-kind event-${event.kind}`}>{event.kind}</span>
                  <span>{event.message}</span>
                </li>
              ))}
            </ol>
          ) : <p className="event-empty">Start the test to record GPS changes, errors and sensor results.</p>}
        </section>

        {json !== null && (
          <details className="panel export-panel">
            <summary>View exported JSON</summary>
            <p>If the browser doesn’t save downloads, select and copy the report below.</p>
            <textarea aria-label="Exported JSON" readOnly value={json} rows={8} />
          </details>
        )}
      </main>
      <footer>
        <span>Data stays in this browser until exported.</span>
        <span>While moving, only a passenger should operate the screen.</span>
      </footer>
    </div>
  );
}
