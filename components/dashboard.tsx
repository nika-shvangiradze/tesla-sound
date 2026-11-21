'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiState, Vector } from '../lib/diagnostic';
import { useDiagnostic } from '../lib/use-diagnostic';
import { downloadReport } from '../lib/photo-report';
import PhotoReport from './photo-report';
import SpeedChart from './speed-chart';
import SiteHeader from './site-header';
import { useLanguage } from './language';

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
  const { t } = useLanguage();
  const good = ['verified', 'granted', 'secure', 'receiving'].includes(status);
  const warning = ['blocked', 'denied', 'error', 'failed', 'signal lost', 'insecure'].includes(status);
  return <span className={`badge ${good ? 'badge-good' : warning ? 'badge-warning' : ''}`}>{t(status)}</span>;
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
  const { t, message } = useLanguage();
  const { view, start, stop, getExport } = useDiagnostic();
  const { active, latest, history, capabilities, events } = view;
  const [json, setJson] = useState<string | null>(null);

  function download() {
    const output = getExport();
    if (!output) return;
    setJson(output);
    try {
      downloadReport(output);
    } catch {
      // The inline JSON remains available when downloads are blocked.
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
      <SiteHeader page="diagnostic" />

      <main>
        <div className="intro">
          <div>
            <h1>{t('GPS Diagnostic')}</h1>
            <p>{t('Measure GPS timing and verify browser sensors and audio')}</p>
          </div>
          <div className="actions" aria-label={t('Test controls')}>
            <button className="button primary" disabled={active} onClick={() => { setJson(null); start(); }}>
              <span className="play-icon" aria-hidden="true" />{t('Start Test')}
            </button>
            <button className="button" disabled={!active} onClick={stop}>
              <span className="stop-icon" aria-hidden="true" />{t('Stop Test')}
            </button>
            <PhotoReport hasRun={view.hasRun} getExport={getExport} />
            <button className="button" disabled={!view.hasRun} onClick={download}>
              <span className="export-icon" aria-hidden="true">↓</span>{t('Export JSON')}
            </button>
          </div>
        </div>

        <div className="session-bar">
          <div className="flex items-center gap-3">
            <span className={`session-dot ${active ? 'session-dot-active' : ''}`} />
            <span role="status">{t(active ? 'Test running' : view.hasRun ? 'Test stopped' : 'Ready to test')}</span>
          </div>
          <div className="session-counts">
            <span>{t('{time} elapsed', { time: duration(view.elapsed) })}</span>
            <span><b>{view.sampleCount}</b> {t('GPS fixes')}</span>
          </div>
        </div>

        <div className="dashboard-grid">
          <section className="panel telemetry" aria-labelledby="telemetry">
            <div className="panel-heading">
              <h2 id="telemetry">{t('GPS telemetry')}</h2>
              <div role="status" aria-label={t('GPS status: {status}', { status: t(view.signal) })}><Badge status={view.signal} /></div>
            </div>
            <div className="telemetry-readings">
              <div className="speed">
                <div className="metric-label">{t('GPS speed')}</div>
                <div className="speed-reading"><strong>{reading(latest?.speedKmh, 1)}</strong><span>{t('km/h')}</span></div>
                <div className="speed-source">{t(speedSource)}</div>
              </div>
              <div className="metrics">
                {metrics.map(([label, value, unit]) => (
                  <div key={label} className="metric">
                    <div className="metric-label">{t(label)}</div>
                    <div><strong>{reading(value)}</strong> <span>{t(unit)}</span></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="chart-section">
              <div className="flex items-center justify-between gap-2">
                <h3>{t('Speed history')}</h3><span className="chart-window">60 {t('s')} · {t('km/h')}</span>
              </div>
              <SpeedChart fixes={history} elapsed={view.elapsed} />
            </div>
          </section>

          <section className="panel browser-panel" aria-labelledby="browser">
            <div className="panel-heading"><h2 id="browser">{t('Browser capabilities')}</h2></div>
            <dl className="capabilities">
              <Capability name={t('Secure context')} status={capabilities.secure === null ? 'unchecked' : capabilities.secure ? 'secure' : 'insecure'}>
                {t(capabilities.secure === false ? 'Open using HTTPS or localhost' : 'Required for geolocation and AudioWorklet')}
              </Capability>
              <Capability name={t('Geolocation')} status={capabilities.geolocation}>
                {t('Permission')} <Badge status={capabilities.permission} />
              </Capability>
              <Capability name="DeviceMotion" status={capabilities.motion}>
                {capabilities.motion === 'verified'
                  ? `X / Y / Z: ${axes(capabilities.acceleration ?? capabilities.accelerationIncludingGravity)} ${t('m/s²')}${capabilities.acceleration ? '' : ` · ${t('incl. gravity')}`}`
                  : t('{events} events · {samples} accelerometer samples', {
                    events: capabilities.motionEventCount, samples: capabilities.accelerationSampleCount,
                  })}
              </Capability>
              <Capability name="AudioContext" status={capabilities.audio}>
                {capabilities.sampleRateHz === null
                  ? t('Requires a Start Test tap')
                  : t('{rate} Hz · base {base} ms · output {output} ms', {
                    rate: capabilities.sampleRateHz, base: reading(capabilities.baseLatencyMs, 1),
                    output: reading(capabilities.outputLatencyMs, 1),
                  })}
              </Capability>
              <Capability name="AudioWorklet" status={capabilities.worklet}>{t('Silent render check')}</Capability>
            </dl>
          </section>
        </div>

        <section className="panel event-panel" aria-labelledby="events">
          <div className="panel-heading">
            <h2 id="events">{t('Event log')}</h2>
            <span className="chart-window">{t('Latest 30 events')}</span>
          </div>
          {events.length ? (
            <ol className="event-list">
              {events.slice().reverse().map((event, index) => (
                <li key={`${event.elapsedMs}-${index}`}>
                  <span className="event-time">{duration(event.elapsedMs)}</span>
                  <span className={`event-kind event-${event.kind}`}>{t(event.kind)}</span>
                  <span>{message(event.message)}</span>
                </li>
              ))}
            </ol>
          ) : <p className="event-empty">{t('Start the test to record GPS changes, errors and sensor results')}</p>}
        </section>

        {json !== null && (
          <details className="panel export-panel">
            <summary>{t('View exported JSON')}</summary>
            <p>{t('If the browser doesn’t save downloads, select and copy the report below')}</p>
            <textarea aria-label={t('Exported JSON')} readOnly value={json} rows={8} />
          </details>
        )}
      </main>
      <footer>
        <span>{t('Reports are processed in your browser')}</span>
        <span>{t('While moving, only a passenger should operate the screen')}</span>
      </footer>
    </div>
  );
}
