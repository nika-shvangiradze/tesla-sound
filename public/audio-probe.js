class VoltSoundProbe extends AudioWorkletProcessor {
  process() {
    // The render thread acknowledged one silent quantum.
    this.port.postMessage('rendered');
    return false;
  }
}

registerProcessor('voltsound-probe', VoltSoundProbe);
