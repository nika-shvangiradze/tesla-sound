'use client';

import { memo } from 'react';
import type { CSSProperties } from 'react';
import { ENGINE_VOICES, type VoiceId } from '../lib/engine-wave';

const START = -133;
const SWEEP = 266;
const SPEED_SCALES: Record<VoiceId, number> = {
  shelby: 240, c63: 320, ferrari: 360, porsche: 360, hellcat: 320,
  countach: 320, huracan: 360, demon: 320, subaru: 280,
  m5: 320, supra: 280,
};

function angle(value: number, max: number) {
  return START + value / max * SWEEP;
}

const DialScale = memo(function DialScale({ max, major, minor, redline }: {
  max: number;
  major: number;
  minor: number;
  redline?: number;
}) {
  const rpmScale = redline !== undefined;
  return (
    <div className="dial-scale" aria-hidden="true">
      {Array.from({ length: max / minor + 1 }, (_, index) => {
        const value = index * minor;
        const isMajor = value % major === 0;
        const degrees = angle(value, max);
        const radians = degrees * Math.PI / 180;
        const tickClass = `dial-tick${isMajor ? ' dial-tick-major' : ''}${rpmScale && value >= redline ? ' dial-tick-red' : ''}`;
        return (
          <span key={value}>
            <span className={tickClass} style={{ transform: `rotate(${degrees}deg)` }}><i /></span>
            {isMajor && (
              <span className="dial-mark" style={{
                left: `${50 + 35.5 * Math.sin(radians)}%`,
                top: `${50 - 35.5 * Math.cos(radians)}%`,
              }}>{rpmScale ? value / 1000 : value}</span>
            )}
          </span>
        );
      })}
    </div>
  );
});

function Dial({ kind, value, max, redline }: {
  kind: 'speed' | 'rpm';
  value: number | null;
  max: number;
  redline?: number;
}) {
  const tach = kind === 'rpm';
  const units = tach ? 'RPM' : 'km/h';
  const title = tach ? 'Engine RPM' : 'GPS speed';
  const reading = value === null ? '—' : tach ? value.toLocaleString('en-US') : value.toFixed(1);
  const needleValue = value === null ? null : Math.min(max, Math.max(0, value));
  const arc = { '--dial-red-start': `${redline ? redline / max * SWEEP : SWEEP}deg` } as CSSProperties;
  return (
    <div className={`dial dial-${kind}`} role={value === null ? 'img' : 'meter'}
      aria-label={value === null ? `${title} unavailable` : title}
      aria-valuemin={value === null ? undefined : 0}
      aria-valuemax={value === null ? undefined : max}
      aria-valuenow={needleValue ?? undefined}
      aria-valuetext={value === null ? undefined : `${reading} ${units}`}>
      <div className="dial-face" aria-hidden="true">
        <div className="dial-arc" style={arc} />
        <DialScale max={max} major={tach ? 1000 : 40} minor={tach ? 200 : 10} redline={redline} />
        {tach && <span className="dial-scale-unit">×1000</span>}
        <div className={needleValue === null ? 'dial-hand dial-hand-parked' : 'dial-hand'}
          style={{ transform: `rotate(${angle(needleValue ?? 0, max)}deg)` }}><i /></div>
        <div className="dial-hub" />
        <div className="dial-readout">
          <strong>{reading}</strong>
          <span>{units}</span>
        </div>
      </div>
    </div>
  );
}

export default function InstrumentDials({ voice, rpm, speed }: { voice: VoiceId; rpm: number; speed: number | null }) {
  const { make, model, redlineRpm } = ENGINE_VOICES[voice];
  const rpmMax = (Math.floor(redlineRpm / 1000) + 1) * 1000;
  return (
    <div className="instrument-cluster" data-voice={voice}>
      <p className="cluster-model"><span>{make}</span> {model}</p>
      <div className="instrument-dials">
        <Dial kind="speed" value={speed} max={SPEED_SCALES[voice]} />
        <Dial kind="rpm" value={rpm} max={rpmMax} redline={redlineRpm} />
      </div>
    </div>
  );
}
