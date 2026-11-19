export const REFERENCE_RPM = 1_600;

type EngineVoice = {
  banks: readonly number[];
  pulseStrength: readonly number[];
};

export const V8_VOICE: EngineVoice = {
  banks: [0, 1, 0, 0, 1, 0, 1, 1],
  pulseStrength: [1, 0.93, 1.08, 0.89, 1.06, 0.96, 1.03, 0.91],
};

function exhaustPulse(t: number) {
  const attack = 1 - Math.exp(-t * 480);
  return attack * (
    0.64 * Math.exp(-t * 45) * Math.sin(t * Math.PI * 2 * 11) +
    0.22 * Math.exp(-t * 84) * Math.sin(t * Math.PI * 2 * 25) +
    0.14 * Math.exp(-t * 122) * Math.sin(t * Math.PI * 2 * 53)
  );
}

export function makeEngineWave(length: number, voice = V8_VOICE) {
  const channels = [new Float32Array(length), new Float32Array(length)];
  let peak = 0;
  for (const [bank, channel] of channels.entries()) {
    for (let frame = 0; frame < length; frame++) {
      const phase = frame / length;
      let value = 0;
      for (let firing = 0; firing < voice.banks.length; firing++) {
        const sameBank = voice.banks[firing] === bank;
        const offset = firing / voice.banks.length + (sameBank ? 0 : 0.033);
        const sincePulse = phase - offset + 1;
        value += exhaustPulse(sincePulse % 1) * voice.pulseStrength[firing] * (sameBank ? 1 : 0.37);
      }
      // Two low engine orders give the closely spaced exhaust pulses a body.
      const angle = phase * Math.PI * 2;
      value += 0.14 * Math.sin(angle * 2 + bank * 0.22) + 0.07 * Math.sin(angle * 4 - bank * 0.27);
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
