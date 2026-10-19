import { compileSchedule } from '../../src/audio/compileSchedule';
import { createClickVoice, createSynthVoice } from '../../src/audio/synthVoice';
import type { DisposableVoice } from '../../src/audio/synthVoice';
import type { PreviewLoops } from '../../src/audio/types';
import { createDocument, eventsFromTokens } from '../../src/domain/rhythm';
import type { PaletteId } from '../../src/domain/types';

export type ProbeWindow = { name: string; startSec: number; endSec: number };
export const EXCLUDED_BOUNDARY_SAMPLES = 2 as const;

function measure(samples: Float32Array, sampleRate: number, window: ProbeWindow) {
  // Exclude exactly two samples on each side of requested semantic boundaries.
  const firstSample = Math.max(0, Math.ceil(window.startSec * sampleRate) + EXCLUDED_BOUNDARY_SAMPLES);
  const endSampleExclusive = Math.min(samples.length, Math.floor(window.endSec * sampleRate) - EXCLUDED_BOUNDARY_SAMPLES);
  let peak = 0;
  let sumSquares = 0;
  let finite = true;
  for (let index = firstSample; index < endSampleExclusive; index++) {
    const sample = samples[index];
    finite &&= Number.isFinite(sample);
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  const sampleCount = Math.max(0, endSampleExclusive - firstSample);
  return { ...window, firstSample, endSampleExclusive, sampleCount, peak, rms: sampleCount ? Math.sqrt(sumSquares / sampleCount) : 0, finite };
}

export async function renderPattern(options: {
  tokens: PaletteId[];
  sampleRate: number;
  bpm?: number;
  loops?: PreviewLoops;
  includeClicks?: boolean;
  windows?: ProbeWindow[];
  points?: number[];
  stopAtSec?: number;
}) {
  const document = createDocument(eventsFromTokens(options.tokens), 'offline-fixture', options.bpm ?? 80);
  const schedule = compileSchedule({ runId: 'offline-fixture:1', documentRevision: 0, purpose: 'preview', snapshot: document }, 0, { loops: options.loops ?? 1, metronome: options.includeClicks ?? false });
  const context = new OfflineAudioContext(1, Math.ceil((schedule.barEndSec + .1) * options.sampleRate), options.sampleRate);
  const master = context.createGain();
  master.gain.value = .18;
  master.connect(context.destination);
  const noteBus = context.createGain();
  noteBus.connect(master);
  const clickBus = context.createGain();
  clickBus.connect(master);
  let disposedSources = 0;
  const voices: DisposableVoice[] = schedule.notes.map(note => createSynthVoice(context, noteBus, note.startSec, note.endSec, () => disposedSources++));
  if (options.includeClicks) {
    for (const click of schedule.clicks) voices.push(createClickVoice(context, clickBus, click.startSec, click.accented, () => disposedSources++));
  }
  if (options.stopAtSec !== undefined) for (const voice of voices) voice.stop(options.stopAtSec);
  const disposedBeforeRendering = disposedSources;
  const rendered = await context.startRendering();
  // Native ended callbacks are tasks; give them a turn after rendering resolves.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  const samples = rendered.getChannelData(0);
  const whole = measure(samples, rendered.sampleRate, { name: 'whole', startSec: 0, endSec: rendered.duration });
  const result = {
    sampleRate: rendered.sampleRate,
    excludedBoundarySamples: EXCLUDED_BOUNDARY_SAMPLES,
    schedule,
    whole,
    probes: (options.windows ?? []).map(window => measure(samples, rendered.sampleRate, window)),
    points: (options.points ?? []).map(timeSec => ({ timeSec, sampleIndex: Math.round(timeSec * rendered.sampleRate), absSample: Math.abs(samples[Math.round(timeSec * rendered.sampleRate)]) })),
    sourcesCreated: voices.length,
    disposedBeforeRendering,
    naturallyDisposed: disposedSources - disposedBeforeRendering,
    activeSourcesAfterRendering: voices.filter(voice => !voice.disposed).length,
  };
  for (const voice of voices) voice.dispose();
  noteBus.disconnect();
  clickBus.disconnect();
  master.disconnect();
  return result;
}

/** Render identical baseline/cancelled voices to compare samples BEFORE a cut. */
export async function renderStopComparison(options: { sampleRate: number; stopSec: number }) {
  const startSec = .1;
  const semanticEndSec = 1.1;
  async function render(stopSec?: number) {
    const context = new OfflineAudioContext(1, Math.ceil(1.2 * options.sampleRate), options.sampleRate);
    const bus = context.createGain();
    bus.gain.value = .18;
    bus.connect(context.destination);
    let disposed = 0;
    const voice = createSynthVoice(context, bus, startSec, semanticEndSec, () => disposed++);
    if (stopSec !== undefined) voice.stop(stopSec);
    const audio = await context.startRendering();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const samples = new Float32Array(audio.getChannelData(0));
    const disposedOnEnded = voice.disposed;
    voice.dispose();
    bus.disconnect();
    return { samples, disposedOnEnded, disposed };
  }
  const baseline = await render();
  const stopped = await render(options.stopSec);
  const comparisonEndSample = Math.floor(options.stopSec * options.sampleRate) - EXCLUDED_BOUNDARY_SAMPLES;
  let beforeStopMaxDelta = 0;
  for (let index = 0; index < comparisonEndSample; index++) beforeStopMaxDelta = Math.max(beforeStopMaxDelta, Math.abs(baseline.samples[index] - stopped.samples[index]));
  const fadeEndSec = Math.min(semanticEndSec, options.stopSec + .005);
  return {
    sampleRate: options.sampleRate,
    excludedBoundarySamples: EXCLUDED_BOUNDARY_SAMPLES,
    stopSec: options.stopSec,
    fadeEndSec,
    beforeStopMaxDelta,
    comparisonEndSample,
    beforeStop: measure(stopped.samples, options.sampleRate, { name: 'beforeStop', startSec, endSec: options.stopSec }),
    fade: measure(stopped.samples, options.sampleRate, { name: 'fade', startSec: options.stopSec, endSec: fadeEndSec }),
    afterFade: measure(stopped.samples, options.sampleRate, { name: 'afterFade', startSec: fadeEndSec, endSec: 1.2 }),
    disposedOnEnded: stopped.disposedOnEnded,
    disposalCallbacks: stopped.disposed,
  };
}
