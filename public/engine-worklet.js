class VoltSoundEngine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 780, minValue: 0, maxValue: 6800 },
      { name: 'voiceMix', defaultValue: 0, minValue: 0, maxValue: 1 },
    ];
  }

  constructor(options) {
    super();
    this.waves = options.processorOptions.waves;
    this.phase = 0;
    this.ready = false;
  }

  process(_inputs, outputs, { rpm, voiceMix }) {
    const channels = outputs[0];
    if (!channels?.length) return true;
    const length = this.waves[0][0].length;
    let phase = this.phase;
    for (let frame = 0; frame < channels[0].length; frame++) {
      const index = Math.floor(phase);
      const next = (index + 1) % length;
      const fraction = phase - index;
      const mix = voiceMix.length === 1 ? voiceMix[0] : voiceMix[frame];
      for (let channel = 0; channel < channels.length; channel++) {
        const first = this.waves[0][channel];
        const second = this.waves[1][channel];
        const from = first[index] + (first[next] - first[index]) * fraction;
        const to = second[index] + (second[next] - second[index]) * fraction;
        channels[channel][frame] = from + (to - from) * mix;
      }
      phase += (rpm.length === 1 ? rpm[0] : rpm[frame]) * length / (120 * sampleRate);
      if (phase >= length) phase -= length;
    }
    this.phase = phase;
    if (!this.ready) {
      this.ready = true;
      this.port.postMessage('rendered');
    }
    return true;
  }
}

registerProcessor('voltsound-engine', VoltSoundEngine);
