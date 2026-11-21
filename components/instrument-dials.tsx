'use client';

import { memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { VoiceId } from '../lib/engine-wave';
import { displaySpeed, gaugeAngle, gaugeTicks } from '../lib/instrument-scale';
import { VEHICLES, type GaugeScale, type VehicleProfile } from '../lib/vehicle-profiles';
import { useLanguage } from './language';

const DialScale = memo(function DialScale({ scale, redline }: { scale: GaugeScale; redline?: number }) {
  return (
    <div className="dial-scale" aria-hidden="true">
      {gaugeTicks(scale).map(({ value, major, angle }) => {
        const radians = angle * Math.PI / 180;
        const tickClass = `dial-tick${major ? ' dial-tick-major' : ''}${redline !== undefined && value >= redline ? ' dial-tick-red' : ''}`;
        return (
          <span key={value}>
            <span className={tickClass} style={{ transform: `rotate(${angle}deg)` }}><i /></span>
            {major && (
              <span className="dial-mark" style={{
                left: `${scale.pivot[0] + 35 * Math.sin(radians)}%`,
                top: `${scale.pivot[1] - 35 * Math.cos(radians)}%`,
              }}>{redline === undefined ? value : value / 1_000}</span>
            )}
          </span>
        );
      })}
    </div>
  );
});

function Readout({ value, units, tach = false }: { value: number | null; units: string; tach?: boolean }) {
  return <div className="dial-readout"><strong>{value === null ? '—' : tach ? value.toLocaleString('en-US') : value.toFixed(1)}</strong><span>{units}</span></div>;
}

function Dial({ kind, value, scale, units, redline }: {
  kind: 'speed' | 'rpm'; value: number | null; scale: GaugeScale; units: string; redline?: number;
}) {
  const { t } = useLanguage();
  const tach = kind === 'rpm';
  const title = t(tach ? 'Simulated RPM' : 'GPS speed');
  const bounded = value === null ? null : Math.max(scale.min, Math.min(scale.max, value));
  const style = {
    '--pivot-x': `${scale.pivot[0]}%`,
    '--pivot-y': `${scale.pivot[1]}%`,
    '--dial-start': `${scale.start}deg`,
    '--dial-sweep': `${scale.sweep}deg`,
    '--dial-red-start': `${redline === undefined ? scale.sweep : gaugeAngle(scale, redline) - scale.start}deg`,
  } as CSSProperties;
  return (
    <div className={`dial dial-${kind}`} role={value === null ? 'img' : 'meter'} style={style}
      aria-label={value === null ? t('{title} unavailable', { title }) : title}
      aria-valuemin={value === null ? undefined : scale.min}
      aria-valuemax={value === null ? undefined : scale.max}
      aria-valuenow={bounded ?? undefined}
      aria-valuetext={value === null ? undefined : `${value} ${units}`}>
      <div className="dial-face" aria-hidden="true">
        <div className="dial-arc" />
        <DialScale scale={scale} redline={redline} />
        {tach && <span className="dial-scale-unit">×1000</span>}
        <div className={bounded === null ? 'dial-hand dial-hand-parked' : 'dial-hand'}
          style={{ transform: `rotate(${gaugeAngle(scale, bounded ?? scale.min)}deg)` }}><i /></div>
        <div className="dial-hub" />
        <Readout value={value} units={units} tach={tach} />
      </div>
    </div>
  );
}

function RaceCluster({ rpm, vehicle, speedometer }: { rpm: number; vehicle: VehicleProfile; speedometer: ReactNode }) {
  const { t } = useLanguage();
  const scale = vehicle.cluster.tach;
  const fraction = (value: number) => (value - scale.min) / (scale.max - scale.min) * 100;
  return (
    <div className="race-cluster">
      <div role="meter" aria-label={t('Simulated RPM')} aria-valuemin={scale.min} aria-valuemax={scale.max} aria-valuenow={rpm}>
        <div className="race-tach-scale" aria-hidden="true">
          {gaugeTicks(scale).filter((tick) => tick.major).map(({ value }) => (
            <span key={value} style={{ left: `${fraction(value)}%` }}>{value / 1_000}</span>
          ))}
        </div>
        <div className="race-tach-track" aria-hidden="true" style={{ '--race-red': `${fraction(vehicle.engine.redlineRpm)}%` } as CSSProperties}>
          <i style={{ width: `${fraction(rpm)}%` }} />
        </div>
      </div>
      <div className="race-readouts">
        {speedometer}
        <Readout value={rpm} units="RPM" tach />
      </div>
    </div>
  );
}

export default function InstrumentDials({ voice, rpm, speed }: { voice: VoiceId; rpm: number; speed: number | null }) {
  const { t } = useLanguage();
  const vehicle = VEHICLES[voice];
  const { cluster, engine, make, model, variant } = vehicle;
  const speedValue = speed === null ? null : displaySpeed(speed, cluster.speed.unit);
  const units = t(cluster.speed.unit);
  const speedometer = cluster.speed.scale
    ? <Dial kind="speed" scale={cluster.speed.scale} value={speedValue} units={units} />
    : <div className="digital-speed"><span>{t('GPS speed')}</span><Readout value={speedValue} units={units} /></div>;
  const tachometer = <Dial kind="rpm" scale={cluster.tach} redline={engine.redlineRpm} value={rpm} units="RPM" />;
  const tachFirst = cluster.layout === 'tach-first';
  return (
    <div className="instrument-cluster" data-voice={voice} data-layout={cluster.layout} data-needle={cluster.needle}>
      <p className="cluster-model"><span>{make}</span> {model}<small>{t(variant)}</small></p>
      {cluster.layout === 'race'
        ? <RaceCluster rpm={rpm} vehicle={vehicle} speedometer={speedometer} />
        : <div className="instrument-dials">
          {tachFirst ? tachometer : speedometer}
          {tachFirst ? speedometer : tachometer}
        </div>}
    </div>
  );
}
