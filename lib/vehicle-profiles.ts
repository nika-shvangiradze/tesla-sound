import type { VoiceId } from './engine-wave';

export type SpeedUnit = 'km/h' | 'mph';
export type TransmissionType = 'manual' | 'automatic' | 'dual-clutch' | 'automated-manual';
export type ScalePoint = readonly [value: number, angle: number];

export type GaugeScale = {
  min: number;
  max: number;
  major: number | readonly number[];
  minor: number;
  start: number;
  sweep: number;
  pivot: readonly [x: number, y: number];
  calibration?: readonly ScalePoint[];
};

export type VehicleProfile = {
  make: string;
  model: string;
  variant: string;
  engine: { idleRpm: number; redlineRpm: number; limiterRpm: number; responseSeconds: number };
  gearbox: {
    type: TransmissionType;
    name: string;
    ratios: readonly number[];
    reverseRatios: readonly number[] | null;
    finalDrive: number;
    circumferenceM: number;
    estimatedGearing?: true;
  };
  topSpeed: { kmh: number; kind: 'stated' | 'limited' | 'lower-bound' } | null;
  cluster: {
    layout: 'speed-first' | 'tach-first' | 'track';
    speed: { unit: SpeedUnit; scale: GaugeScale | null };
    tach: GaugeScale;
    needle: 'fine' | 'classic' | 'blade';
  };
};

const CENTER = [50, 50] as const;

function scale(max: number, major: GaugeScale['major'], minor: number, start: number, sweep: number): GaugeScale {
  return { min: 0, max, major, minor, start, sweep, pivot: CENTER };
}

// Effective rolling circumferences are estimates. Metric sizes use nominal unloaded geometry.
function tyre(widthMm: number, aspect: number, rimInches: number) {
  return Math.PI * (rimInches * 25.4 + 2 * widthMm * aspect / 100) / 1_000;
}

const TORQUEFLITE = [4.71, 3.14, 2.10, 1.67, 1.29, 1, 0.84, 0.67];

// Variant-specific sources and the status of each approximation are listed in README.md.
export const VEHICLES: Record<VoiceId, VehicleProfile> = {
  shelby: {
    make: 'Shelby', model: 'GT500 ’70', variant: '1970 SportsRoof · US',
    engine: { idleRpm: 780, redlineRpm: 5_500, limiterRpm: 6_000, responseSeconds: 0.19 },
    gearbox: {
      type: 'manual', name: 'Ford Toploader', ratios: [2.32, 1.69, 1.29, 1],
      reverseRatios: [2.32], finalDrive: 3.50, circumferenceM: 2.07,
    },
    topSpeed: null,
    cluster: {
      layout: 'speed-first', speed: { unit: 'mph', scale: scale(140, 20, 5, -135, 270) },
      tach: scale(8_000, 1_000, 200, -133, 266), needle: 'classic',
    },
  },
  c63: {
    make: 'Mercedes-AMG', model: 'C63 W204', variant: '2008 Sedan · EU',
    engine: { idleRpm: 750, redlineRpm: 7_000, limiterRpm: 7_200, responseSeconds: 0.14 },
    gearbox: {
      type: 'automatic', name: 'AMG SPEEDSHIFT PLUS 7G-TRONIC', ratios: [4.38, 2.86, 1.92, 1.37, 1, 0.82, 0.73],
      reverseRatios: [3.42, 2.23], finalDrive: 2.85, circumferenceM: tyre(255, 35, 18),
    },
    topSpeed: { kmh: 250, kind: 'limited' },
    cluster: {
      layout: 'speed-first', speed: { unit: 'km/h', scale: scale(320, 40, 10, -135, 270) },
      tach: scale(8_000, 1_000, 250, -135, 270), needle: 'fine',
    },
  },
  ferrari: {
    make: 'Ferrari', model: '458 Italia', variant: '2010 Coupé · EU',
    engine: { idleRpm: 900, redlineRpm: 9_000, limiterRpm: 9_000, responseSeconds: 0.095 },
    gearbox: {
      type: 'dual-clutch', name: 'F1 DCT', ratios: [3.077, 2.185, 1.626, 1.286, 1.028, 0.839, 0.693],
      reverseRatios: [2.791], finalDrive: 5.143, circumferenceM: tyre(295, 35, 20),
    },
    topSpeed: { kmh: 325, kind: 'lower-bound' },
    cluster: {
      layout: 'tach-first', speed: { unit: 'km/h', scale: null },
      tach: scale(10_000, 1_000, 200, -139, 278), needle: 'blade',
    },
  },
  porsche: {
    make: 'Porsche', model: '911 GT3', variant: '2025 992.2 · EU',
    engine: { idleRpm: 850, redlineRpm: 9_000, limiterRpm: 9_000, responseSeconds: 0.10 },
    gearbox: {
      type: 'dual-clutch', name: 'PDK', ratios: [3.75, 2.38, 1.72, 1.34, 1.11, 0.96, 0.84],
      reverseRatios: [3.42], finalDrive: 4.54, circumferenceM: tyre(315, 30, 21),
    },
    topSpeed: { kmh: 311, kind: 'stated' },
    cluster: {
      layout: 'track', speed: { unit: 'km/h', scale: null },
      tach: scale(10_000, 1_000, 200, -136, 272), needle: 'fine',
    },
  },
  hellcat: {
    make: 'Dodge', model: 'Challenger SRT Hellcat', variant: '2018 Standard Body · Canada',
    engine: { idleRpm: 750, redlineRpm: 6_200, limiterRpm: 6_200, responseSeconds: 0.15 },
    gearbox: {
      type: 'automatic', name: 'TorqueFlite 8HP90', ratios: TORQUEFLITE,
      reverseRatios: [3.32], finalDrive: 2.62, circumferenceM: tyre(275, 40, 20),
    },
    topSpeed: null,
    cluster: {
      layout: 'tach-first', speed: { unit: 'km/h', scale: scale(320, 40, 10, -132, 264) },
      tach: scale(7_000, 1_000, 250, -132, 264), needle: 'blade',
    },
  },
  countach: {
    make: 'Lamborghini', model: 'Countach 5000 QV', variant: '1985 Carbureted · Europe',
    engine: { idleRpm: 900, redlineRpm: 7_400, limiterRpm: 7_600, responseSeconds: 0.17 },
    gearbox: {
      type: 'manual', name: 'Lamborghini', ratios: [2.232, 1.625, 1.088, 0.858, 0.707],
      reverseRatios: null, finalDrive: 4.09, circumferenceM: tyre(345, 35, 15), estimatedGearing: true,
    },
    topSpeed: null,
    cluster: {
      layout: 'speed-first', speed: { unit: 'km/h', scale: scale(320, 40, 10, -140, 280) },
      tach: scale(9_000, 1_000, 250, -137, 274), needle: 'classic',
    },
  },
  huracan: {
    make: 'Lamborghini', model: 'Huracán Performante', variant: '2018 Coupé · US',
    engine: { idleRpm: 850, redlineRpm: 8_500, limiterRpm: 8_500, responseSeconds: 0.10 },
    gearbox: {
      type: 'dual-clutch', name: 'LDF', ratios: [2.76, 1.89, 1.45, 1.13, 0.91, 0.72, 0.57],
      reverseRatios: null, finalDrive: 2.65 * 2.23, circumferenceM: tyre(305, 30, 20), estimatedGearing: true,
    },
    topSpeed: { kmh: 325, kind: 'lower-bound' },
    cluster: {
      layout: 'track', speed: { unit: 'mph', scale: null },
      tach: scale(10_000, 1_000, 250, -126, 252), needle: 'blade',
    },
  },
  demon: {
    make: 'Dodge', model: 'Challenger SRT Demon', variant: '2018 SRT Demon · Canada',
    engine: { idleRpm: 750, redlineRpm: 6_300, limiterRpm: 6_500, responseSeconds: 0.14 },
    gearbox: {
      type: 'automatic', name: 'TorqueFlite 8HP90', ratios: TORQUEFLITE,
      reverseRatios: [3.32], finalDrive: 3.09, circumferenceM: tyre(315, 40, 18),
    },
    topSpeed: null,
    cluster: {
      layout: 'tach-first', speed: { unit: 'km/h', scale: scale(320, 40, 10, -132, 264) },
      tach: scale(7_000, 1_000, 250, -132, 264), needle: 'blade',
    },
  },
  subaru: {
    make: 'Subaru', model: 'Impreza WRX STI', variant: '2005 GD Sedan · Canada',
    engine: { idleRpm: 750, redlineRpm: 7_000, limiterRpm: 7_200, responseSeconds: 0.155 },
    gearbox: {
      type: 'manual', name: 'STI 6MT', ratios: [3.636, 2.375, 1.761, 1.346, 0.971, 0.756],
      reverseRatios: [3.545], finalDrive: 3.90, circumferenceM: tyre(225, 45, 17),
    },
    topSpeed: null,
    cluster: {
      layout: 'tach-first', speed: { unit: 'km/h', scale: scale(260, 20, 10, -130, 260) },
      tach: scale(9_000, 1_000, 200, -134, 268), needle: 'fine',
    },
  },
  m5: {
    make: 'BMW', model: 'M5 E60 V10', variant: '2005 E60 Sedan · EU',
    engine: { idleRpm: 750, redlineRpm: 8_000, limiterRpm: 8_250, responseSeconds: 0.11 },
    gearbox: {
      type: 'automated-manual', name: 'SMG III Drivelogic', ratios: [3.985, 2.652, 1.806, 1.392, 1.159, 1, 0.833],
      reverseRatios: [3.985], finalDrive: 3.62, circumferenceM: tyre(285, 35, 19),
    },
    topSpeed: { kmh: 250, kind: 'limited' },
    cluster: {
      layout: 'speed-first',
      speed: { unit: 'km/h', scale: {
        ...scale(330, [0, 20, 40, 60, 80, 100, 120, 150, 180, 210, 240, 270, 300, 330], 10, -132, 264),
        // The photographed face changes from 20 km/h to 30 km/h per labeled interval.
        calibration: [[0, -132], [120, -7], [330, 132]],
      } },
      tach: scale(9_000, 1_000, 250, -131, 262), needle: 'fine',
    },
  },
  supra: {
    make: 'Toyota', model: 'Supra 2JZ-GTE', variant: '1993 A80 Turbo · UK',
    engine: { idleRpm: 750, redlineRpm: 6_800, limiterRpm: 7_000, responseSeconds: 0.14 },
    gearbox: {
      type: 'manual', name: 'Getrag V160', ratios: [3.827, 2.360, 1.685, 1.312, 1, 0.793],
      reverseRatios: [3.28], finalDrive: 3.266, circumferenceM: tyre(255, 40, 17),
    },
    topSpeed: { kmh: 155 * 1.609344, kind: 'limited' },
    cluster: {
      layout: 'tach-first', speed: { unit: 'mph', scale: scale(180, 20, 5, -135, 270) },
      tach: scale(8_000, 1_000, 200, -131, 262), needle: 'fine',
    },
  },
  m3: {
    make: 'BMW', model: 'M3 E46 S54', variant: '2001 Coupé · EU',
    engine: { idleRpm: 800, redlineRpm: 8_000, limiterRpm: 8_000, responseSeconds: 0.115 },
    gearbox: {
      type: 'manual', name: 'Getrag 420G', ratios: [4.227, 2.528, 1.669, 1.226, 1, 0.828],
      reverseRatios: [3.746], finalDrive: 3.62, circumferenceM: tyre(255, 40, 18),
    },
    topSpeed: { kmh: 250, kind: 'limited' },
    cluster: {
      layout: 'speed-first', speed: { unit: 'km/h', scale: scale(300, 30, 10, -132, 264) },
      tach: scale(9_000, 1_000, 200, -132, 264), needle: 'fine',
    },
  },
};
