import assert from 'node:assert/strict';
import test from 'node:test';
import { readReport, summarizeReport } from '../lib/photo-report.ts';

const base = {
  app: 'VoltSound GPS Diagnostic',
  schemaVersion: '1.0.0',
  signalGapThresholdMs: 5000,
  durationMs: 19000,
  capabilities: {},
  fixes: [],
  events: [],
};

test('photo summary keeps real zero speed, separates update and position intervals, and counts trailing gaps', () => {
  const report = readReport(JSON.stringify({
    ...base,
    fixes: [
      { elapsedMs: 1000, rawPositionTimestamp: 1, positionTimestampMs: 1, speedKmh: 0, callbackIntervalMs: null, positionIntervalMs: null, dataAgeMs: 0, accuracyM: 10 },
      { elapsedMs: 2000, rawPositionTimestamp: 996, positionTimestampMs: 996, speedKmh: null, callbackIntervalMs: 1000, positionIntervalMs: 995, dataAgeMs: -2, accuracyM: 30 },
      { elapsedMs: 8000, rawPositionTimestamp: 6896, positionTimestampMs: 6896, speedKmh: 36, callbackIntervalMs: 6000, positionIntervalMs: 5900, dataAgeMs: 400, accuracyM: 20 },
    ],
    events: [
      { kind: 'error', gpsErrorCode: 2 },
      { kind: 'warning', message: 'No GPS fix received.' },
      { kind: 'warning', message: 'DeviceMotion is blocked.' },
    ],
  }));
  const summary = summarizeReport(report);
  assert.deepEqual(summary.speed, { count: 2, min: 0, median: 18, p95: 36, max: 36 });
  assert.equal(summary.firstFixMs, 1000);
  assert.equal(summary.intervals.median, 3500);
  assert.equal(summary.intervals.p95, 6000);
  assert.equal(summary.positionIntervals.p95, 5900);
  assert.equal(summary.ages.median, 0);
  assert.equal(summary.unusableTimestamps, 0);
  assert.equal(summary.accuracy.median, 20);
  assert.equal(summary.trailingGapMs, 11000);
  assert.equal(summary.callbackGaps, 2);
  assert.equal(summary.gpsErrors, 1);
});

test('older saved photo reports recompute timestamp metrics from raw values', () => {
  const report = readReport(JSON.stringify({
    ...base,
    fixes: [{
      receivedAtMs: 1_800_000_000_000,
      elapsedMs: 1_000,
      positionTimestampMs: 80_000_000_000,
      positionIntervalMs: 100_000,
      dataAgeMs: 1_720_000_000_000,
      speedKmh: 36,
    }],
  }));
  const [fix] = report.fixes;
  assert.equal(fix.rawPositionTimestamp, 80_000_000_000);
  assert.equal(fix.dataAgeMs, null);
  assert.equal(fix.positionIntervalMs, null);
  assert.equal(fix.speedKmh, 36);
  assert.equal(summarizeReport(report).unusableTimestamps, 1);
});

test('photo summary distinguishes a test with no fixes from zero measurements', () => {
  const summary = summarizeReport(readReport(JSON.stringify(base)));
  assert.equal(summary.firstFixMs, null);
  assert.equal(summary.trailingGapMs, null);
  assert.equal(summary.callbackGaps, 0);
  assert.equal(summary.ages.median, null);
  assert.equal(summary.speed.min, null);
  assert.throws(() => readReport('{}'), /Invalid VoltSound report/);
});
