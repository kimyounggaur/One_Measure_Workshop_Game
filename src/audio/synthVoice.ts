/** Product envelope/timbre constants. Master gain belongs to AudioEngine. */
export const SYNTH_FREQUENCY_HZ = 261.63 as const;
export const SECOND_HARMONIC_GAIN = 0.12 as const;
export const NOTE_ATTACK_SEC = 0.005 as const;
export const NOTE_RELEASE_MAX_SEC = 0.015 as const;
export const NOTE_RELEASE_RATIO = 0.1 as const;
export const SOURCE_STOP_GRACE_SEC = 0.005 as const;
export const STOP_FADE_SEC = 0.005 as const;
export const CLICK_DURATION_SEC = 0.045 as const;
export const CLICK_GAIN = 0.35 as const;
export const CLICK_FREQUENCY_HZ = 880 as const;
export const ACCENTED_CLICK_FREQUENCY_HZ = 1320 as const;

export type DisposableVoice = {
  /** Start a short fade; repeated calls can only shorten an existing stop. */
  stop(atSec?: number): void;
  /** Immediate resource cleanup, safe after stop or native ended. */
  dispose(): void;
  readonly disposed: boolean;
};

const waves = new WeakMap<BaseAudioContext, PeriodicWave>();
function noteWave(context: BaseAudioContext): PeriodicWave {
  let wave = waves.get(context);
  if (!wave) {
    wave = context.createPeriodicWave(new Float32Array([0, 0, 0]), new Float32Array([0, 1, SECOND_HARMONIC_GAIN]), { disableNormalization: false });
    waves.set(context, wave);
  }
  return wave;
}

function createVoice(context: BaseAudioContext, destination: AudioNode, startSec: number, endSec: number, frequencyHz: number, peakGain: number, wave: PeriodicWave | undefined, onDisposed?: () => void): DisposableVoice {
  if (!Number.isFinite(startSec) || startSec < 0 || !Number.isFinite(endSec) || endSec <= startSec || !Number.isFinite(endSec + SOURCE_STOP_GRACE_SEC)) {
    throw new RangeError('Voice times must be finite, nonnegative, and have positive duration.');
  }
  const durationSec = endSec - startSec;
  const releaseSec = Math.min(NOTE_RELEASE_MAX_SEC, durationSec * NOTE_RELEASE_RATIO);
  const attackSec = Math.min(NOTE_ATTACK_SEC, durationSec - releaseSec);
  const attackEndSec = startSec + attackSec;
  const releaseStartSec = endSec - releaseSec;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  let disposed = false;
  let started = false;
  let requestedStopSec = endSec;
  let sourceStopSec = endSec + SOURCE_STOP_GRACE_SEC;

  function envelopeAt(timeSec: number): number {
    if (timeSec <= startSec || timeSec >= endSec) return 0;
    if (timeSec < attackEndSec) return peakGain * (timeSec - startSec) / attackSec;
    if (timeSec > releaseStartSec) return peakGain * (endSec - timeSec) / releaseSec;
    return peakGain;
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    oscillator.onended = null;
    if (started && context.currentTime < sourceStopSec) {
      // Web Audio stop() replaces the previous time; never extend it.
      sourceStopSec = Math.min(sourceStopSec, context.currentTime);
      oscillator.stop(sourceStopSec);
    }
    oscillator.disconnect();
    envelope.disconnect();
    onDisposed?.();
  }
  const voice: DisposableVoice = {
    get disposed() { return disposed; },
    dispose,
    stop(atSec = context.currentTime): void {
      if (disposed) return;
      if (!Number.isFinite(atSec) || atSec < 0) throw new RangeError('Stop time must be finite and nonnegative.');
      const stopSec = Math.max(context.currentTime, atSec);
      if (stopSec >= requestedStopSec) return;
      requestedStopSec = stopSec;
      if (stopSec <= startSec) {
        // This future source will never sound, so it can be disconnected now.
        dispose();
        return;
      }
      const fadeEndSec = Math.min(endSec, stopSec + STOP_FADE_SEC);
      envelope.gain.cancelScheduledValues(stopSec);
      // Preserve any attack/release segment ending after this cut. A setValue
      // alone would delete that ramp and change audio BEFORE a future stop.
      envelope.gain.linearRampToValueAtTime(envelopeAt(stopSec), stopSec);
      envelope.gain.linearRampToValueAtTime(0, fadeEndSec);
      sourceStopSec = Math.min(sourceStopSec, fadeEndSec + SOURCE_STOP_GRACE_SEC);
      oscillator.stop(sourceStopSec);
    },
  };
  try {
    oscillator.type = 'sine';
    if (wave) oscillator.setPeriodicWave(wave);
    oscillator.frequency.setValueAtTime(frequencyHz, startSec);
    envelope.gain.value = 0;
    envelope.gain.setValueAtTime(0, startSec);
    envelope.gain.linearRampToValueAtTime(peakGain, attackEndSec);
    envelope.gain.setValueAtTime(peakGain, releaseStartSec);
    envelope.gain.linearRampToValueAtTime(0, endSec);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.onended = dispose;
    oscillator.start(startSec);
    started = true;
    oscillator.stop(sourceStopSec);
  } catch (error) {
    dispose();
    throw error;
  }
  return voice;
}

export function createSynthVoice(context: BaseAudioContext, destination: AudioNode, startSec: number, endSec: number, onDisposed?: () => void): DisposableVoice {
  return createVoice(context, destination, startSec, endSec, SYNTH_FREQUENCY_HZ, 1, noteWave(context), onDisposed);
}

export function createClickVoice(context: BaseAudioContext, destination: AudioNode, startSec: number, accented: boolean, onDisposed?: () => void): DisposableVoice {
  return createVoice(context, destination, startSec, startSec + CLICK_DURATION_SEC, accented ? ACCENTED_CLICK_FREQUENCY_HZ : CLICK_FREQUENCY_HZ, CLICK_GAIN, undefined, onDisposed);
}
