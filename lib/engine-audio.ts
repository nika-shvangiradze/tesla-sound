import { IDLE_RPM } from './drive-model';
import { ENGINE_VOICES, makeEngineWave, REFERENCE_RPM, VOICE_IDS, type VoiceId } from './engine-wave';

export type AudioPath = 'standard' | 'worklet' | 'fallback';
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
type VoiceSource = { id: VoiceId; source: AudioBufferSourceNode; gain: GainNode; buffer: AudioBuffer };

function deadline<T>(operation: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Audio startup timed out.')), ms);
    void operation.then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
}

export class EngineAudio {
  readonly context: AudioContext;
  private readonly sources: VoiceSource[];
  private readonly loopDuration: number;
  private readonly standardGain: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly master: GainNode;
  private readonly gate: GainNode;
  private worklet: { node: AudioWorkletNode; gain: GainNode; rpm: AudioParam; voiceMix: AudioParam } | null = null;
  private disposed = false;
  private rpm = IDLE_RPM;
  private load = -1;
  private volume = -1;
  private voice: VoiceId;

  constructor(voice: VoiceId) {
    const Context = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!Context) throw new Error('Web Audio is unavailable in this browser.');
    const context = new Context({ latencyHint: 'interactive' });
    this.context = context;
    this.voice = voice;
    try {
      const length = Math.round(context.sampleRate * 120 / REFERENCE_RPM);
      this.loopDuration = length / context.sampleRate;
      this.standardGain = context.createGain();
      this.sources = VOICE_IDS.map((id) => {
        const buffer = context.createBuffer(2, length, context.sampleRate);
        makeEngineWave(length, id).forEach((channel, index) => buffer.getChannelData(index).set(channel));
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.playbackRate.value = this.playbackRate(IDLE_RPM);
        const gain = context.createGain();
        gain.gain.value = id === voice ? 1 : 0;
        source.connect(gain).connect(this.standardGain);
        return { id, source, gain, buffer };
      });
      this.tone = context.createBiquadFilter();
      this.tone.type = 'lowpass';
      this.tone.frequency.value = ENGINE_VOICES[voice].idleCutoffHz;
      this.tone.Q.value = 0.48;
      const highpass = context.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 24;
      highpass.Q.value = 0.65;
      this.gate = context.createGain();
      this.gate.gain.value = 0.28;
      this.master = context.createGain();
      this.master.gain.value = 0;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 12;
      limiter.ratio.value = 5;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.095;
      this.standardGain.connect(this.tone);
      this.tone.connect(highpass).connect(this.gate).connect(limiter).connect(this.master).connect(context.destination);
      const start = context.currentTime;
      this.sources.forEach(({ source }) => source.start(start));
    } catch (error) {
      void context.close().catch(() => {});
      throw error;
    }
  }

  private playbackRate(rpm: number) {
    return rpm * this.loopDuration / 120;
  }

  async resume() {
    await deadline(this.context.resume(), 4_000);
    if (this.context.state !== 'running') throw new Error('The browser paused audio output.');
  }

  update(rpm: number, load: number, volume: number, voice: VoiceId) {
    if (this.disposed) return;
    const now = this.context.currentTime;
    if (Math.abs(rpm - this.rpm) > 2) {
      this.rpm = rpm;
      const rate = this.playbackRate(rpm);
      this.sources.forEach(({ source }) => source.playbackRate.setTargetAtTime(rate, now, 0.035));
      this.worklet?.rpm.setTargetAtTime(rpm, now, 0.035);
    }
    const voiceChanged = this.voice !== voice;
    const loadChanged = Math.abs(load - this.load) > 0.008;
    if (voiceChanged) {
      this.voice = voice;
      this.sources.forEach(({ id, gain }) => gain.gain.setTargetAtTime(id === voice ? 1 : 0, now, 0.035));
      this.worklet?.voiceMix.setTargetAtTime(VOICE_IDS.indexOf(voice), now, 0.035);
    }
    if (voiceChanged || loadChanged) {
      const config = ENGINE_VOICES[voice];
      this.load = load;
      this.tone.frequency.setTargetAtTime(config.idleCutoffHz + config.loadCutoffHz * load, now, 0.055);
      this.gate.gain.setTargetAtTime((0.29 + 0.66 * load) * config.level, now, 0.045);
    }
    if (volume !== this.volume) {
      this.volume = volume;
      this.master.gain.setTargetAtTime(volume * 0.68, now, 0.035);
    }
  }

  async enableWorklet(onPath: (path: AudioPath) => void) {
    const { context } = this;
    try {
      if (!context.audioWorklet || typeof window.AudioWorkletNode !== 'function') throw new Error('Worklet unavailable.');
      await deadline(context.audioWorklet.addModule('/engine-worklet.js?voices=2'), 3_000);
      if (this.disposed) return;
      const node = new AudioWorkletNode(context, 'voltsound-engine', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        parameterData: { rpm: this.rpm, voiceMix: VOICE_IDS.indexOf(this.voice) },
        processorOptions: {
          waves: this.sources.map(({ buffer }) => [buffer.getChannelData(0), buffer.getChannelData(1)]),
        },
      });
      const rpm = node.parameters.get('rpm');
      const voiceMix = node.parameters.get('voiceMix');
      const gain = context.createGain();
      if (!rpm || !voiceMix) {
        node.port.close();
        throw new Error('Engine processor parameters unavailable.');
      }
      gain.gain.value = 0;
      this.worklet = { node, gain, rpm, voiceMix };
      await deadline(new Promise<void>((resolve, reject) => {
        node.port.onmessage = (event) => { if (event.data === 'rendered') resolve(); };
        node.onprocessorerror = () => reject(new Error('Engine processor failed.'));
        node.connect(gain).connect(this.tone);
      }), 3_000);
      if (this.disposed) return;
      node.port.onmessage = null;
      node.onprocessorerror = () => this.useStandard(onPath);
      const now = context.currentTime;
      gain.gain.setTargetAtTime(1, now, 0.018);
      this.standardGain.gain.setTargetAtTime(0, now, 0.018);
      onPath('worklet');
    } catch {
      if (!this.disposed) this.useStandard(onPath);
    }
  }

  private useStandard(onPath: (path: AudioPath) => void) {
    this.standardGain.gain.setTargetAtTime(1, this.context.currentTime, 0.012);
    this.disconnectWorklet();
    onPath('fallback');
  }

  private disconnectWorklet() {
    if (!this.worklet) return;
    this.worklet.node.onprocessorerror = null;
    this.worklet.node.port.close();
    this.worklet.node.disconnect();
    this.worklet.gain.disconnect();
    this.worklet = null;
  }

  stop() {
    if (this.disposed) return;
    this.disposed = true;
    const { context } = this;
    context.onstatechange = null;
    const time = context.currentTime;
    this.master.gain.cancelScheduledValues(time);
    this.master.gain.setTargetAtTime(0, time, 0.008);
    this.sources.forEach(({ source }) => source.stop(time + 0.045));
    window.setTimeout(() => {
      this.disconnectWorklet();
      void context.close().catch(() => {});
    }, 55);
  }
}
