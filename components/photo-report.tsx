'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { readReport, SAVED_REPORT_KEY, summarizeReport } from '../lib/photo-report';
import type { DiagnosticReport } from '../lib/photo-report';

function measure(value: number | null, unit: string, decimals = 0) {
  return value === null ? '—' : `${value.toFixed(decimals)} ${unit}`;
}

function timing(median: number | null, p95: number | null) {
  return median === null || p95 === null ? '—' : `${median.toFixed(0)} / ${p95.toFixed(0)} ms`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="photo-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

function ReportSummary({ report }: { report: DiagnosticReport }) {
  const stats = summarizeReport(report);
  const { capabilities, durationMs, fixes, signal, stoppedAtMs } = report;
  const seconds = Math.floor(durationMs / 1000);
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <>
      <dl className="photo-overview">
        <Row label={stoppedAtMs === null ? 'Elapsed at capture' : 'Test duration'}>{elapsed}</Row>
        <Row label="GPS fixes">{fixes.length}</Row>
        <Row label="Fixes with speed">{stats.speed.count} / {fixes.length}</Row>
        <Row label="GPS status">{signal}</Row>
      </dl>
      <div className="photo-sections">
        <section aria-labelledby="photo-timing">
          <h3 id="photo-timing">GPS timing</h3>
          <dl>
            <Row label="First fix">{measure(stats.firstFixMs, 'ms')}</Row>
            <Row label="Callback interval · median / p95">{timing(stats.intervals.median, stats.intervals.p95)}</Row>
            <Row label="Position interval · median / p95">{timing(stats.positionIntervals.median, stats.positionIntervals.p95)}</Row>
            <Row label="Data age · median / p95">{timing(stats.ages.median, stats.ages.p95)}</Row>
            <Row label="Negative data ages">{stats.negativeAges}</Row>
            <Row label="Longest callback interval">{measure(stats.intervals.max, 'ms')}</Row>
          </dl>
        </section>
        <section aria-labelledby="photo-samples">
          <h3 id="photo-samples">Speed & signal</h3>
          <dl>
            <Row label="Speed range">{stats.speed.min === null || stats.speed.max === null
              ? '—' : `${stats.speed.min.toFixed(1)}–${stats.speed.max.toFixed(1)} km/h`}</Row>
            <Row label="Median position accuracy">{measure(stats.accuracy.median, 'm')}</Row>
            <Row label={`Callback gaps ≥ ${report.signalGapThresholdMs / 1000} s`}>{stats.callbackGaps}</Row>
            <Row label="Time since final fix">{measure(stats.trailingGapMs, 'ms')}</Row>
            <Row label="GPS errors">{stats.gpsErrors}</Row>
            <Row label="Location permission">{capabilities.permission}</Row>
          </dl>
        </section>
        <section aria-labelledby="photo-capabilities">
          <h3 id="photo-capabilities">Sensors & audio</h3>
          <dl>
            <Row label="DeviceMotion">{capabilities.motion}</Row>
            <Row label="Accelerometer samples">{capabilities.accelerationSampleCount} / {capabilities.motionEventCount} events</Row>
            <Row label="AudioContext">{capabilities.audio}</Row>
            <Row label="AudioWorklet">{capabilities.worklet}</Row>
            <Row label="Audio base latency">{measure(capabilities.baseLatencyMs, 'ms', 1)}</Row>
            <Row label="Audio output latency">{measure(capabilities.outputLatencyMs, 'ms', 1)}</Row>
          </dl>
        </section>
      </div>
    </>
  );
}

export default function PhotoReport({ hasRun, getExport }: { hasRun: boolean; getExport: () => string | null }) {
  const [saved, setSaved] = useState<DiagnosticReport | null>(null);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    try {
      const json = window.localStorage.getItem(SAVED_REPORT_KEY);
      if (json) setSaved(readReport(json));
    } catch {
      // The current test can still be displayed when storage is disabled.
    }
  }, []);

  function showReport() {
    if (hasRun) {
      const json = getExport();
      if (!json) return;
      const current = readReport(json);
      setReport(current);
      setSaved(current);
      try { window.localStorage.setItem(SAVED_REPORT_KEY, json); } catch { /* The photo view remains open. */ }
    } else setReport(saved);
    dialog.current?.showModal();
  }

  return (
    <>
      <button className="button photo-action" disabled={!hasRun && !saved} onClick={showReport}>
        {!hasRun && saved ? 'Last Photo Report' : 'Photo Report'}
      </button>
      <dialog ref={dialog} className="panel photo-dialog" aria-labelledby="photo-title">
        <div className="photo-heading">
          <div>
            <h2 id="photo-title">VoltSound · Photo Report</h2>
            <p>Photograph this screen and attach the photo in chat.</p>
          </div>
          <form method="dialog"><button className="button">Close</button></form>
        </div>
        {report && <ReportSummary report={report} />}
      </dialog>
    </>
  );
}
