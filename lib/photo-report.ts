import type { Run } from './diagnostic';

export const SAVED_REPORT_KEY = 'voltsound.saved-report.v1';

export type DiagnosticReport = Run & {
  app: 'VoltSound GPS Diagnostic';
  schemaVersion: '1.0.0';
  signalGapThresholdMs: number;
};

export function readReport(json: string): DiagnosticReport {
  const report = JSON.parse(json) as DiagnosticReport | null;
  if (report?.app !== 'VoltSound GPS Diagnostic' || report.schemaVersion !== '1.0.0' ||
      !Array.isArray(report.fixes) || !Array.isArray(report.events) || !report.capabilities) {
    throw new Error('Invalid VoltSound report.');
  }
  return report;
}

function stats(values: (number | null)[]) {
  const sorted = values.filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);
  const count = sorted.length;
  const middle = Math.floor(count / 2);
  return {
    count,
    min: sorted[0] ?? null,
    median: count === 0 ? null : count % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(count * 0.95) - 1] ?? null,
    max: sorted[count - 1] ?? null,
  };
}

export function summarizeReport(report: DiagnosticReport) {
  const { fixes, durationMs, events, signalGapThresholdMs } = report;
  const intervals = fixes.map((fix) => fix.callbackIntervalMs);
  const ages = fixes.map((fix) => fix.dataAgeMs);
  const lastFix = fixes[fixes.length - 1];
  const trailingGap = lastFix ? Math.max(0, durationMs - lastFix.elapsedMs) : null;
  const threshold = signalGapThresholdMs;
  return {
    firstFixMs: fixes[0]?.elapsedMs ?? null,
    trailingGapMs: trailingGap,
    intervals: stats(intervals),
    positionIntervals: stats(fixes.map((fix) => fix.positionIntervalMs)),
    ages: stats(ages),
    negativeAges: ages.filter((age) => age !== null && age < 0).length,
    speed: stats(fixes.map((fix) => fix.speedKmh)),
    accuracy: stats(fixes.map((fix) => fix.accuracyM)),
    callbackGaps: [...intervals, trailingGap].filter((ms) => ms !== null && ms >= threshold).length,
    gpsErrors: events.filter((event) => event.kind === 'error' &&
      (event.gpsErrorCode !== undefined || event.message.startsWith('GPS:'))).length,
  };
}

export function downloadReport(output: string) {
  const url = URL.createObjectURL(new Blob([output], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `voltsound-diagnostic-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
