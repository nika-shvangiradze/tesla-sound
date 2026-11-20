class VoltSoundEngine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'rpm', defaultValue: 780, minValue: 0, maxValue: 12000 }];
  }

  constructor(options) {
    super();
    this.waves = options.processorOptions.waves;
    this.cycles = options.processorOptions.cycles;
    this.voice = options.processorOptions.voice;
    this.gains = new Float64Array(this.waves.length);
    this.gains[this.voice] = 1;
    this.fade = 1 - Math.exp(-1 / (sampleRate * 0.035));
    this.port.onmessage = ({ data }) => {
      if (Number.isInteger(data) && data >= 0 && data < this.waves.length) this.voice = data;
    };
    this.phase = 0;
    this.ready = false;
  }

  process(_inputs, outputs, { rpm }) {
    const channels = outputs[0];
    if (!channels?.length) return true;
    const length = this.waves[0][0].length;
    let phase = this.phase;
    for (let frame = 0; frame < channels[0].length; frame++) {
      const index = Math.floor(phase);
      const next = (index + 1) % length;
      const fraction = phase - index;
      for (const channel of channels) channel[frame] = 0;
      for (let voice = 0; voice < this.waves.length; voice++) {
        const target = voice === this.voice ? 1 : 0;
        const previous = this.gains[voice];
        const gain = Math.abs(target - previous) < 0.0001 ? target : previous + (target - previous) * this.fade;
        this.gains[voice] = gain;
        if (gain === 0) continue;
        for (let channel = 0; channel < channels.length; channel++) {
          const wave = this.waves[voice][channel];
          channels[channel][frame] += (wave[index] + (wave[next] - wave[index]) * fraction) * gain;
        }
      }
      phase += (rpm.length === 1 ? rpm[0] : rpm[frame]) * length / (120 * this.cycles * sampleRate);
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
