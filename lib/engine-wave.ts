export const REFERENCE_RPM = 1_600;
export const LOOP_CYCLES = 4;

export type EngineVoice = {
  description: string;
  banks: readonly number[];
  pulseStrength: readonly number[];
  timing: readonly number[];
  attack: number;
  resonances: readonly (readonly [order: number, damping: number, gain: number])[];
  bankDelay: number;
  crossover: number;
  rumble: number;
  idleCutoffHz: number;
  loadCutoffHz: number;
  level: number;
  whine: { level: number; rpmRatio: number } | null;
};

const CROSS_PLANE_BANKS = [0, 1, 0, 0, 1, 0, 1, 1];
const FLAT_PLANE_BANKS = [0, 1, 0, 1, 0, 1, 0, 1];
const ALTERNATING_SIX_BANKS = [0, 1, 0, 1, 0, 1];

export const ENGINE_VOICES = {
  shelby: {
    description: 'Deep, loping big-block rumble',
    banks: CROSS_PLANE_BANKS,
    pulseStrength: [1.12, 0.83, 1.09, 0.89, 1.04, 0.91, 1.13, 0.81],
    timing: [0, 0.003, -0.004, 0.006, -0.002, 0.001, -0.004, 0.004],
    attack: 325,
    resonances: [[8, 30, 0.76], [19, 57, 0.22], [39, 105, 0.10]],
    bankDelay: 0.038,
    crossover: 0.29,
    rumble: 0.19,
    idleCutoffHz: 380,
    loadCutoffHz: 2_150,
    level: 0.94,
    whine: null,
  },
  c63: {
    description: 'Tight pulses and a brighter exhaust note',
    banks: CROSS_PLANE_BANKS,
    pulseStrength: [1.02, 0.97, 1.03, 0.95, 1.02, 0.96, 1.04, 0.97],
    timing: [0, 0.001, -0.001, 0.001, 0, 0.001, -0.001, 0.001],
    attack: 550,
    resonances: [[12, 48, 0.60], [29, 94, 0.34], [57, 126, 0.17]],
    bankDelay: 0.024,
    crossover: 0.43,
    rumble: 0.105,
    idleCutoffHz: 620,
    loadCutoffHz: 3_450,
    level: 1.13,
    whine: null,
  },
  ferrari: {
    description: 'High-revving flat-plane V8',
    banks: FLAT_PLANE_BANKS,
    pulseStrength: [1.02, 0.99, 0.97, 1.01, 1, 0.96, 1.03, 1],
    timing: [0, 0, 0, 0, 0, 0, 0, 0],
    attack: 570,
    resonances: [[8, 29, 0.49], [24, 54, 0.38], [40, 84, 0.23], [64, 128, 0.12]],
    bankDelay: 0.012,
    crossover: 0.47,
    rumble: 0.035,
    idleCutoffHz: 760,
    loadCutoffHz: 4_630,
    level: 0.98,
    whine: null,
  },
  porsche: {
    description: 'Metallic flat-six exhaust note',
    banks: ALTERNATING_SIX_BANKS,
    pulseStrength: [1, 0.96, 1.04, 0.95, 1.02, 0.98],
    timing: [0, 0.001, 0, 0.001, 0, 0],
    attack: 620,
    resonances: [[6, 35, 0.61], [18, 57, 0.40], [36, 87, 0.24], [54, 118, 0.10]],
    bankDelay: 0.027,
    crossover: 0.34,
    rumble: 0.045,
    idleCutoffHz: 710,
    loadCutoffHz: 4_180,
    level: 1.06,
    whine: null,
  },
  hellcat: {
    description: 'HEMI V8 rumble with supercharger whine under load',
    banks: CROSS_PLANE_BANKS,
    pulseStrength: [1.06, 0.9, 1.07, 0.94, 1.04, 0.91, 1.08, 0.92],
    timing: [0, 0.002, -0.001, 0.002, 0, 0.001, -0.001, 0.002],
    attack: 390,
    resonances: [[8, 36, 0.72], [20, 65, 0.30], [42, 103, 0.14]],
    bankDelay: 0.033,
    crossover: 0.36,
    rumble: 0.18,
    idleCutoffHz: 480,
    loadCutoffHz: 3_200,
    level: 0.96,
    whine: { level: 0.16, rpmRatio: 0.30 },
  },
  countach: {
    description: 'Layered, resonant classic V12',
    banks: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    pulseStrength: [1.03, 0.95, 1.01, 0.97, 1.04, 0.96, 1, 0.98, 1.02, 0.95, 1.04, 0.97],
    timing: [0, 0.001, 0, -0.001, 0.001, 0, 0, 0.001, -0.001, 0, 0.001, 0],
    attack: 455,
    resonances: [[12, 32, 0.56], [24, 54, 0.38], [38, 78, 0.22], [58, 121, 0.09]],
    bankDelay: 0.016,
    crossover: 0.43,
    rumble: 0.055,
    idleCutoffHz: 660,
    loadCutoffHz: 4_070,
    level: 1.02,
    whine: null,
  },
  huracan: {
    description: 'Sharp, high-revving V10',
    banks: [0, 1, 0, 1, 1, 0, 1, 0, 1, 0],
    pulseStrength: [1.04, 0.97, 1.02, 0.98, 1.01, 0.96, 1.04, 0.97, 1.02, 0.99],
    timing: [0, 0.007, -0.005, 0.007, -0.004, 0.006, -0.005, 0.007, -0.004, 0.005],
    attack: 650,
    resonances: [[10, 45, 0.51], [20, 70, 0.40], [40, 92, 0.26], [63, 133, 0.12]],
    bankDelay: 0.015,
    crossover: 0.39,
    rumble: 0.032,
    idleCutoffHz: 840,
    loadCutoffHz: 4_800,
    level: 0.96,
    whine: null,
  },
  demon: {
    description: 'Heavy HEMI rumble and aggressive supercharger whine',
    banks: CROSS_PLANE_BANKS,
    pulseStrength: [1.14, 0.85, 1.1, 0.94, 1.075, 0.89, 1.09, 0.94],
    timing: [0, 0.005, -0.002, 0.004, -0.002, 0.003, -0.003, 0.002],
    attack: 405,
    resonances: [[8, 30, 0.64], [16, 54, 0.35], [36, 93, 0.20]],
    bankDelay: 0.030,
    crossover: 0.38,
    rumble: 0.20,
    idleCutoffHz: 505,
    loadCutoffHz: 3_450,
    level: 0.93,
    whine: { level: 0.23, rpmRatio: 0.35 },
  },
  subaru: {
    description: 'Offbeat flat-four burble with a light turbo whistle',
    banks: [0, 0, 1, 1],
    pulseStrength: [1.09, 0.86, 1.06, 0.90],
    timing: [0, 0.052, -0.018, 0.029],
    attack: 320,
    resonances: [[4, 24, 0.65], [12, 42, 0.33], [23, 69, 0.18], [38, 109, 0.08]],
    bankDelay: 0.054,
    crossover: 0.54,
    rumble: 0.24,
    idleCutoffHz: 410,
    loadCutoffHz: 2_100,
    level: 1.08,
    whine: { level: 0.075, rpmRatio: 0.26 },
  },
  m5: {
    description: 'S85 V10 rasp with a sharp upper-RPM howl',
    banks: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    pulseStrength: [1, 0.97, 1.015, 0.98, 1.03, 0.98, 1.04, 0.96, 1.02, 0.99],
    timing: [0, 0.003, -0.004, 0.003, -0.003, 0.002, -0.003, 0.004, -0.002, 0.003],
    attack: 710,
    resonances: [[10, 41, 0.55], [20, 63, 0.27], [31, 82, 0.32], [51, 113, 0.14]],
    bankDelay: 0.022,
    crossover: 0.44,
    rumble: 0.055,
    idleCutoffHz: 680,
    loadCutoffHz: 4_650,
    level: 0.98,
    whine: null,
  },
  supra: {
    description: 'A80 inline-six, progressive twin-turbo spool and lift-off hiss',
    banks: ALTERNATING_SIX_BANKS,
    pulseStrength: [1.04, 1.02, 0.95, 1.03, 0.96, 1],
    timing: [0, 0.001, 0, 0.002, 0, 0.001],
    attack: 405,
    resonances: [[6, 30, 0.61], [12, 47, 0.35], [25, 72, 0.19], [43, 117, 0.08]],
    bankDelay: 0.010,
    crossover: 0.71,
    rumble: 0.075,
    idleCutoffHz: 490,
    loadCutoffHz: 3_360,
    level: 1.00,
    whine: null,
  },
  m3: {
    description: 'S54 inline-six intake growl and metallic exhaust rasp',
    // Firing order 1-5-3-6-2-4 alternates the front and rear cylinder groups.
    banks: ALTERNATING_SIX_BANKS,
    pulseStrength: [1.05, 0.96, 1.02, 0.99, 1.01, 0.98],
    timing: [0, 0, 0, 0, 0, 0],
    attack: 700,
    resonances: [[6, 30, 0.64], [12, 46, 0.34], [24, 74, 0.26], [36, 80, 0.34], [48, 108, 0.22], [66, 133, 0.11]],
    bankDelay: 0.012,
    crossover: 0.61,
    rumble: 0.052,
    idleCutoffHz: 555,
    loadCutoffHz: 4_250,
    level: 1.03,
    whine: null,
  },
} satisfies Record<string, EngineVoice>;

export type VoiceId = keyof typeof ENGINE_VOICES;
export const VOICE_IDS = Object.keys(ENGINE_VOICES) as VoiceId[];
export const DEFAULT_VOICE: VoiceId = 'shelby';

export function supraBoostTarget(rpm: number, load: number) {
  const firstTurbo = Math.max(0, Math.min(1, (rpm - 1_800) / 2_200));
  const secondTurbo = Math.max(0, Math.min(1, (rpm - 3_500) / 1_600));
  return Math.max(0, Math.min(1, (load - 0.13) / 0.87)) * (0.70 * firstTurbo + 0.30 * secondTurbo);
}

function exhaustPulse(phase: number, voice: EngineVoice) {
  let value = 0;
  for (const [order, damping, gain] of voice.resonances) {
    value += gain * Math.exp(-phase * damping) * Math.sin(phase * Math.PI * 2 * order);
  }
  return value * (1 - Math.exp(-phase * voice.attack));
}

export function makeEngineWave(length: number, voiceId: VoiceId = DEFAULT_VOICE) {
  const voice = ENGINE_VOICES[voiceId];
  const pulse = Float32Array.from({ length }, (_, frame) => exhaustPulse(frame / length, voice));
  const channels = [new Float32Array(length), new Float32Array(length)];
  let peak = 0;
  for (const [bank, channel] of channels.entries()) {
    for (let frame = 0; frame < length; frame++) {
      const phase = frame / length;
      let value = 0;
      for (let firing = 0; firing < voice.banks.length; firing++) {
        const sameBank = voice.banks[firing] === bank;
        const offset = firing / voice.banks.length + voice.timing[firing] + (sameBank ? 0 : voice.bankDelay);
        const position = ((phase - offset + 1) % 1) * length;
        const index = Math.floor(position);
        const next = (index + 1) % length;
        const amplitude = pulse[index] + (pulse[next] - pulse[index]) * (position - index);
        value += amplitude * voice.pulseStrength[firing] * (sameBank ? 1 : voice.crossover);
      }
      // Two low engine orders give the closely spaced exhaust pulses a body.
      const angle = phase * Math.PI * 2;
      value += voice.rumble * (Math.sin(angle * 2 + bank * 0.22) + 0.5 * Math.sin(angle * 4 - bank * 0.27));
      channel[frame] = value;
      peak = Math.max(peak, Math.abs(value));
    }
  }
  const gain = peak > 0 ? 0.79 / peak : 1;
  for (const channel of channels) {
    const mean = channel.reduce((sum, value) => sum + value, 0) / length;
    for (let frame = 0; frame < length; frame++) channel[frame] = (channel[frame] - mean) * gain;
  }
  return channels;
}

export function makeEngineLoop(cycleFrames: number, voiceId: VoiceId) {
  const depth = 0.025 + ENGINE_VOICES[voiceId].rumble * 0.33;
  const length = cycleFrames * LOOP_CYCLES;
  return makeEngineWave(cycleFrames, voiceId).map((cycle, bank) =>
    Float32Array.from({ length }, (_, frame) => {
      const angle = frame / length * Math.PI * 2;
      const variation = 0.72 * Math.sin(angle + bank * 0.65) + 0.28 * Math.sin(angle * 3 + 0.4);
      return cycle[frame % cycleFrames] * (1 + depth * variation);
    }));
}
