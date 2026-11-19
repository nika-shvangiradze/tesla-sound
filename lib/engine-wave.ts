export const REFERENCE_RPM = 1_600;

type EngineVoice = {
  label: string;
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
};

const CROSS_PLANE_BANKS = [0, 1, 0, 0, 1, 0, 1, 1];

export const ENGINE_VOICES = {
  shelby: {
    label: 'Shelby GT500 ’70',
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
  },
  c63: {
    label: 'C63 AMG W204',
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
  },
} satisfies Record<string, EngineVoice>;

export type VoiceId = keyof typeof ENGINE_VOICES;
export const VOICE_IDS = ['shelby', 'c63'] as const satisfies readonly VoiceId[];
export const DEFAULT_VOICE: VoiceId = 'shelby';

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
