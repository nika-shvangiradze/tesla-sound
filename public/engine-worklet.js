class VoltSoundEngine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'rpm', defaultValue: 780, minValue: 0, maxValue: 6800 }];
  }

  constructor(options) {
    super();
    this.waves = options.processorOptions.waves;
    this.phase = 0;
    this.ready = false;
  }

  process(_inputs, outputs, { rpm }) {
    const channels = outputs[0];
    if (!channels?.length) return true;
    const length = this.waves[0].length;
    let phase = this.phase;
    for (let frame = 0; frame < channels[0].length; frame++) {
      const index = Math.floor(phase);
      const next = (index + 1) % length;
      const fraction = phase - index;
      for (let channel = 0; channel < channels.length; channel++) {
        const wave = this.waves[channel];
        channels[channel][frame] = wave[index] + (wave[next] - wave[index]) * fraction;
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
