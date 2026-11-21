'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { readReport, SAVED_REPORT_KEY, summarizeReport } from '../lib/photo-report';
import type { DiagnosticReport } from '../lib/photo-report';
import { useLanguage } from './language';

function measure(value: number | null, unit: string, decimals = 0) {
  return value === null ? '—' : `${value.toFixed(decimals)} ${unit}`;
}

function timing(median: number | null, p95: number | null, unit: string) {
  return median === null || p95 === null ? '—' : `${median.toFixed(0)} / ${p95.toFixed(0)} ${unit}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="photo-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

function ReportSummary({ report }: { report: DiagnosticReport }) {
  const { t } = useLanguage();
  const ms = t('ms');
  const stats = summarizeReport(report);
  const { capabilities, durationMs, fixes, signal, stoppedAtMs } = report;
  const seconds = Math.floor(durationMs / 1000);
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <>
      <dl className="photo-overview">
        <Row label={t(stoppedAtMs === null ? 'Elapsed at capture' : 'Test duration')}>{elapsed}</Row>
        <Row label={t('GPS fixes')}>{fixes.length}</Row>
        <Row label={t('Fixes with speed')}>{stats.speed.count} / {fixes.length}</Row>
        <Row label={t('GPS status at capture')}>{t(signal)}</Row>
      </dl>
      <div className="photo-sections">
        <section aria-labelledby="photo-timing">
          <h3 id="photo-timing">{t('GPS timing')}</h3>
          <dl>
            <Row label={t('First fix')}>{measure(stats.firstFixMs, ms)}</Row>
            <Row label={t('Callback interval · median / p95')}>{timing(stats.intervals.median, stats.intervals.p95, ms)}</Row>
            <Row label={t('Position interval · median / p95')}>{timing(stats.positionIntervals.median, stats.positionIntervals.p95, ms)}</Row>
            <Row label={t('Data age · median / p95')}>{timing(stats.ages.median, stats.ages.p95, ms)}</Row>
            <Row label={t('Unusable timestamps')}>{stats.unusableTimestamps} / {fixes.length}</Row>
            <Row label={t('Longest callback interval')}>{measure(stats.intervals.max, ms)}</Row>
          </dl>
        </section>
        <section aria-labelledby="photo-samples">
          <h3 id="photo-samples">{t('Speed & signal')}</h3>
          <dl>
            <Row label={t('Speed range')}>{stats.speed.min === null || stats.speed.max === null
              ? '—' : `${stats.speed.min.toFixed(1)}–${stats.speed.max.toFixed(1)} ${t('km/h')}`}</Row>
            <Row label={t('Median position accuracy')}>{measure(stats.accuracy.median, t('m'))}</Row>
            <Row label={t('Callback gaps ≥ {seconds} s', { seconds: report.signalGapThresholdMs / 1000 })}>{stats.callbackGaps}</Row>
            <Row label={t('Time since final fix')}>{measure(stats.trailingGapMs, ms)}</Row>
            <Row label={t('GPS errors')}>{stats.gpsErrors}</Row>
            <Row label={t('Location permission')}>{t(capabilities.permission)}</Row>
          </dl>
        </section>
        <section aria-labelledby="photo-capabilities">
          <h3 id="photo-capabilities">{t('Sensors & audio')}</h3>
          <dl>
            <Row label="DeviceMotion">{t(capabilities.motion)}</Row>
            <Row label={t('Accelerometer samples')}>{t('{samples} / {events} events', {
              samples: capabilities.accelerationSampleCount, events: capabilities.motionEventCount,
            })}</Row>
            <Row label="AudioContext">{t(capabilities.audio)}</Row>
            <Row label="AudioWorklet">{t(capabilities.worklet)}</Row>
            <Row label={t('Audio base latency')}>{measure(capabilities.baseLatencyMs, ms, 1)}</Row>
            <Row label={t('Audio output latency')}>{measure(capabilities.outputLatencyMs, ms, 1)}</Row>
          </dl>
        </section>
      </div>
    </>
  );
}

export default function PhotoReport({ hasRun, getExport }: { hasRun: boolean; getExport: () => string | null }) {
  const { t } = useLanguage();
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
        {t(!hasRun && saved ? 'Last Photo Report' : 'Photo Report')}
      </button>
      <dialog ref={dialog} className="panel photo-dialog" aria-labelledby="photo-title">
        <div className="photo-heading">
          <div>
            <h2 id="photo-title">{t('VoltSound · Photo Report')}</h2>
            <p>{t('Photograph this screen and attach the photo in chat')}</p>
          </div>
          <form method="dialog"><button className="button">{t('Close')}</button></form>
        </div>
        {report && <ReportSummary report={report} />}
      </dialog>
    </>
  );
}
