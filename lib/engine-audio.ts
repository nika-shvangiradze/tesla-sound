import { IDLE_RPM } from './drive-model';
import { ENGINE_VOICES, LOOP_CYCLES, makeEngineLoop, REFERENCE_RPM, VOICE_IDS, type VoiceId } from './engine-wave';

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
  private readonly combustion: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly exhaust: BiquadFilterNode;
  private readonly intake: BiquadFilterNode;
  private readonly intakeGain: GainNode;
  private readonly master: GainNode;
  private readonly gate: GainNode;
  private readonly boostTone: OscillatorNode;
  private readonly boostGain: GainNode;
  private worklet: { node: AudioWorkletNode; gain: GainNode; rpm: AudioParam } | null = null;
  private disposed = false;
  private rpm = IDLE_RPM;
  private load = -1;
  private volume = -1;
  private overrun = -1;
  private voice: VoiceId;

  constructor(voice: VoiceId) {
    const Context = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!Context) throw new Error('Web Audio is unavailable in this browser.');
    const context = new Context({ latencyHint: 'interactive' });
    this.context = context;
    this.voice = voice;
    try {
      const cycleFrames = Math.round(context.sampleRate * 120 / REFERENCE_RPM);
      this.loopDuration = cycleFrames / context.sampleRate;
      this.standardGain = context.createGain();
      this.combustion = context.createGain();
      this.sources = VOICE_IDS.map((id) => {
        const buffer = context.createBuffer(2, cycleFrames * LOOP_CYCLES, context.sampleRate);
        makeEngineLoop(cycleFrames, id).forEach((channel, index) => buffer.getChannelData(index).set(channel));
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
      this.exhaust = context.createBiquadFilter();
      this.exhaust.type = 'peaking';
      this.exhaust.frequency.value = 130;
      this.exhaust.Q.value = 0.85;
      this.intake = context.createBiquadFilter();
      this.intake.type = 'bandpass';
      this.intake.frequency.value = 410;
      this.intake.Q.value = 0.92;
      this.intakeGain = context.createGain();
      this.intakeGain.gain.value = 0;
      this.boostTone = context.createOscillator();
      this.boostTone.frequency.value = IDLE_RPM * (ENGINE_VOICES[voice].whine?.rpmRatio ?? 0.30) + 30;
      this.boostGain = context.createGain();
      this.boostGain.gain.value = 0;
      this.boostTone.connect(this.boostGain).connect(this.tone);
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
      this.standardGain.connect(this.combustion);
      this.combustion.connect(this.tone).connect(this.exhaust).connect(highpass);
      this.combustion.connect(this.intake).connect(this.intakeGain).connect(highpass);
      highpass.connect(this.gate).connect(limiter).connect(this.master).connect(context.destination);
      const start = context.currentTime;
      this.sources.forEach(({ source }) => source.start(start));
      this.boostTone.start(start);
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

  update(rpm: number, load: number, volume: number, voice: VoiceId, overrun: number) {
    if (this.disposed) return;
    const now = this.context.currentTime;
    const config = ENGINE_VOICES[voice];
    const rpmChanged = Math.abs(rpm - this.rpm) > 2;
    const voiceChanged = this.voice !== voice;
    const loadChanged = Math.abs(load - this.load) > 0.008;
    const overrunChanged = Math.abs(overrun - this.overrun) > 0.02;
    if (rpmChanged) {
      this.rpm = rpm;
      const rate = this.playbackRate(rpm);
      this.sources.forEach(({ source }) => source.playbackRate.setTargetAtTime(rate, now, 0.019));
      this.worklet?.rpm.setTargetAtTime(rpm, now, 0.019);
    }
    if (rpmChanged || voiceChanged || this.load < 0) {
      const firingHz = this.rpm * config.banks.length / 120;
      this.exhaust.frequency.setTargetAtTime(64 + firingHz * (1.1 + config.rumble * 2), now, 0.036);
      this.intake.frequency.setTargetAtTime(180 + firingHz * 3.1, now, 0.028);
    }
    if (config.whine && (rpmChanged || voiceChanged)) {
      this.boostTone.frequency.setTargetAtTime(this.rpm * config.whine.rpmRatio + 30, now, 0.035);
    }
    if (voiceChanged) {
      this.voice = voice;
      this.sources.forEach(({ id, gain }) => gain.gain.setTargetAtTime(id === voice ? 1 : 0, now, 0.035));
      this.worklet?.node.port.postMessage(VOICE_IDS.indexOf(voice));
    }
    if (voiceChanged || loadChanged || overrunChanged) {
      this.load = load;
      this.overrun = overrun;
      this.tone.frequency.setTargetAtTime(config.idleCutoffHz + config.loadCutoffHz * load ** 0.84 + overrun * 220, now, 0.034);
      this.exhaust.gain.setTargetAtTime(1.3 + config.rumble * 7 + overrun * 1.7, now, 0.040);
      this.intakeGain.gain.setTargetAtTime(0.34 * load ** 1.7 + 0.055 * overrun, now, 0.029);
      this.gate.gain.setTargetAtTime((0.25 + 0.68 * load + 0.08 * overrun) * config.level, now, 0.023);
      this.boostGain.gain.setTargetAtTime((config.whine?.level ?? 0) * load * load, now, 0.036);
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
      await deadline(context.audioWorklet.addModule('/engine-worklet.js?v=4'), 3_000);
      if (this.disposed) return;
      const node = new AudioWorkletNode(context, 'voltsound-engine', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        parameterData: { rpm: this.rpm },
        processorOptions: {
          waves: this.sources.map(({ buffer }) => [buffer.getChannelData(0), buffer.getChannelData(1)]),
          voice: VOICE_IDS.indexOf(this.voice),
          cycles: LOOP_CYCLES,
        },
      });
      const rpm = node.parameters.get('rpm');
      const gain = context.createGain();
      if (!rpm) {
        node.port.close();
        throw new Error('Engine processor parameters unavailable.');
      }
      gain.gain.value = 0;
      this.worklet = { node, gain, rpm };
      await deadline(new Promise<void>((resolve, reject) => {
        node.port.onmessage = (event) => { if (event.data === 'rendered') resolve(); };
        node.onprocessorerror = () => reject(new Error('Engine processor failed.'));
        node.connect(gain).connect(this.combustion);
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
    this.boostTone.stop(time + 0.045);
    window.setTimeout(() => {
      this.disconnectWorklet();
      void context.close().catch(() => {});
    }, 55);
  }
}
