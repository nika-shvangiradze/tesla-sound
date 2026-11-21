import type { GaugeScale, SpeedUnit } from './vehicle-profiles';

export function displaySpeed(kmh: number, unit: SpeedUnit) {
  return Math.round((unit === 'mph' ? kmh / 1.609344 : kmh) * 10) / 10;
}

export function gaugeAngle(scale: GaugeScale, value: number) {
  const bounded = Math.min(scale.max, Math.max(scale.min, value));
  const points = scale.calibration;
  if (!points) return scale.start + (bounded - scale.min) / (scale.max - scale.min) * scale.sweep;
  for (let index = 1; index < points.length; index++) {
    const [end, to] = points[index];
    if (bounded <= end) {
      const [start, from] = points[index - 1];
      return from + (bounded - start) / (end - start) * (to - from);
    }
  }
  return scale.start + scale.sweep;
}

export function gaugeTicks(scale: GaugeScale) {
  const major = new Set<number>([scale.min, scale.max]);
  if (typeof scale.major === 'number') {
    for (let value = scale.min + scale.major; value < scale.max; value += scale.major) major.add(value);
  } else scale.major.forEach((value) => major.add(value));
  const ticks = new Set(major);
  for (let value = scale.min + scale.minor; value < scale.max; value += scale.minor) ticks.add(value);
  return [...ticks].sort((a, b) => a - b).map((value) => ({
    value, major: major.has(value), angle: gaugeAngle(scale, value),
  }));
}
