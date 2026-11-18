import { errorText, type Capabilities, type ProbeWindow } from './diagnostic';
import { finite } from './gps';

export async function probeAudio(
  signal: AbortSignal,
  update: (patch: Partial<Capabilities>) => void,
  report: (kind: 'warning' | 'success', message: string) => void,
) {
  const Context = window.AudioContext || (window as ProbeWindow).webkitAudioContext;
  if (!Context) return;
  let context: AudioContext | undefined;
  let node: AudioWorkletNode | undefined;
  let phase: 'audio' | 'worklet' = 'audio';

  function bounded<T>(operation: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        reject(new Error(signal.aborted ? 'Test stopped.' : 'Probe timed out after 4 s.'));
      };
      const timer = window.setTimeout(cancel, 4_000);
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
      void operation.then(resolve, reject).finally(() => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
      });
    });
  }

  try {
    update({ audio: 'testing' });
    context = new Context({ latencyHint: 'interactive' });
    await bounded(context.resume());
    if (context.state !== 'running') throw new Error(`AudioContext state is ${context.state}.`);
    const base = finite(context.baseLatency);
    const output = finite(context.outputLatency);
    update({
      audio: 'verified', audioContextState: context.state, sampleRateHz: context.sampleRate,
      baseLatencyMs: base === null ? null : base * 1000,
      outputLatencyMs: output === null ? null : output * 1000,
    });
    report('success', 'AudioContext entered the running state.');
    if (!window.isSecureContext || !context.audioWorklet || typeof window.AudioWorkletNode !== 'function') {
      update({ worklet: window.isSecureContext ? 'unsupported' : 'insecure' });
      return;
    }
    phase = 'worklet';
    update({ worklet: 'testing' });
    await bounded(context.audioWorklet.addModule(new URL('audio-probe.js', window.location.href).href));
    node = new AudioWorkletNode(context, 'voltsound-probe', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    const worklet = node;
    await bounded(new Promise<void>((resolve, reject) => {
      worklet.port.onmessage = (event) => {
        if (event.data === 'rendered') resolve();
      };
      worklet.onprocessorerror = () => reject(new Error('Processor runtime error.'));
      worklet.connect(context!.destination);
    }));
    update({ worklet: 'verified' });
    report('success', 'AudioWorklet rendered a silent audio frame.');
  } catch (error) {
    if (!signal.aborted) {
      const status = error instanceof Error && error.name === 'NotAllowedError' ? 'blocked' : 'error';
      update(phase === 'audio'
        ? { audio: status, audioContextState: context?.state ?? null }
        : { worklet: status });
      report('warning', `${phase === 'audio' ? 'AudioContext' : 'AudioWorklet'}: ${errorText(error)}`);
    }
  } finally {
    if (node) {
      node.onprocessorerror = null;
      node.port.close();
      node.disconnect();
    }
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
}
