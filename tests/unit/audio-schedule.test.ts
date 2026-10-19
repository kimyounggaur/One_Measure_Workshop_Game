import { describe, expect, it, vi } from 'vitest';
import { freezeSnapshot } from '../../src/app/machine';
import { compileSchedule } from '../../src/audio/compileSchedule';
import { createClickVoice, createSynthVoice } from '../../src/audio/synthVoice';
import type { AudioRunRequest, AudioStartOptions } from '../../src/audio/types';
import { createDocument, eventFromPalette, eventsFromTokens } from '../../src/domain/rhythm';
import type { PaletteId } from '../../src/domain/types';

function request(tokens: readonly PaletteId[], bpm = 80): AudioRunRequest {
  return { runId: 'audio-test:1', documentRevision: 0, purpose: 'preview', snapshot: freezeSnapshot(createDocument(eventsFromTokens(tokens), 'audio-test', bpm)) };
}

describe('S07 pure absolute audio schedule', () => {
  it('uses independent quarter80 L3 golden values including four quarter count-in clicks', () => {
    const result = compileSchedule(request(['N2', 'N2', 'R2', 'N2']), 10);
    expect(result).toMatchObject({ countInStartSec: 10, countInDurationSec: 3, quarterDurationSec: .75, barStartSec: 13, barDurationSec: 3, barEndSec: 16, loops: 1, unknownTicks: 0 });
    expect(result.notes).toEqual([
      { startSec: 13, endSec: 13.75, startTick: 0, durationTick: 480, loopIndex: 0 },
      { startSec: 13.75, endSec: 14.5, startTick: 480, durationTick: 480, loopIndex: 0 },
      { startSec: 15.25, endSec: 16, startTick: 1440, durationTick: 480, loopIndex: 0 },
    ]);
    expect(result.clicks).toEqual([
      { startSec: 10, accented: true, countIn: true },
      { startSec: 10.75, accented: false, countIn: true },
      { startSec: 11.5, accented: false, countIn: true },
      { startSec: 12.25, accented: false, countIn: true },
    ]);
  });

  it.each([
    { tokens: ['N4', 'N2', 'N2'], starts: [13, 14.5, 15.25], ends: [14.5, 15.25, 16] },
    { tokens: ['N2', 'N4', 'N2'], starts: [13, 13.75, 15.25], ends: [13.75, 15.25, 16] },
    { tokens: ['N2'], starts: [13], ends: [13.75] },
    { tokens: ['N1', 'R1'], starts: [13], ends: [13.375] },
    { tokens: ['R8'], starts: [], ends: [] },
  ] as { tokens: PaletteId[]; starts: number[]; ends: number[] }[])('matches independent golden $tokens boundaries', ({ tokens, starts, ends }) => {
    const result = compileSchedule(request(tokens), 10);
    expect(result.notes.map(note => note.startSec)).toEqual(starts);
    expect(result.notes.map(note => note.endSec)).toEqual(ends);
  });

  it('distinguishes equal duration N4 versus N2 N2 with one versus two onsets', () => {
    const sustained = compileSchedule(request(['N4']), 10);
    const restarted = compileSchedule(request(['N2', 'N2']), 10);
    expect(sustained.notes.map(note => [note.startSec, note.endSec])).toEqual([[13, 14.5]]);
    expect(restarted.notes.map(note => [note.startSec, note.endSec])).toEqual([[13, 13.75], [13.75, 14.5]]);
  });

  it('matches L6 quarter60 relative onsets and both rest spans', () => {
    const result = compileSchedule(request(['R1', 'N1', 'N2', 'N1', 'R1', 'N2'], 60), 10);
    expect(result.barStartSec).toBe(14);
    expect(result.barEndSec).toBe(18);
    expect(result.notes.map(note => [note.startSec, note.endSec])).toEqual([[14.5, 15], [15, 16], [16, 16.5], [17, 18]]);
  });

  it('schedules all four L3 loops at absolute positions with one count-in only', () => {
    const result = compileSchedule(request(['N2', 'N2', 'R2', 'N2']), 10, { loops: 4, metronome: true });
    expect(result.barEndSec).toBe(25);
    expect(result.notes.map(note => [note.startSec, note.endSec, note.loopIndex])).toEqual([
      [13, 13.75, 0], [13.75, 14.5, 0], [15.25, 16, 0],
      [16, 16.75, 1], [16.75, 17.5, 1], [18.25, 19, 1],
      [19, 19.75, 2], [19.75, 20.5, 2], [21.25, 22, 2],
      [22, 22.75, 3], [22.75, 23.5, 3], [24.25, 25, 3],
    ]);
    expect(result.clicks.filter(click => click.countIn).map(click => click.startSec)).toEqual([10, 10.75, 11.5, 12.25]);
    expect(result.clicks.filter(click => !click.countIn).map(click => click.startSec)).toEqual([13, 13.75, 14.5, 15.25, 16, 16.75, 17.5, 18.25, 19, 19.75, 20.5, 21.25, 22, 22.75, 23.5, 24.25]);
    expect(result.clicks.filter(click => click.accented).map(click => click.startSec)).toEqual([10, 13, 16, 19, 22]);
  });

  it('avoids accumulated loop time even at non-binary quarter durations', () => {
    const result = compileSchedule(request(['N2', 'N2', 'N2', 'N2'], 137), 10, { loops: 4 });
    // Written independently in ticks / 480 / bpm, never from prior loop end.
    expect(result.notes[12].startSec).toBe(10 + 240 / 137 + 3 * (240 / 137));
    expect(result.notes[15].endSec).toBe(10 + 240 / 137 + 3 * (240 / 137) + 240 / 137);
  });

  it('allows two preview loops and keeps the metronome optional', () => {
    const result = compileSchedule(request(['N8']), 0, { loops: 2, metronome: false });
    expect(result.notes.map(note => [note.startSec, note.endSec])).toEqual([[3, 6], [6, 9]]);
    expect(result.clicks).toHaveLength(4);
  });

  it('keeps all-rest and unknown gaps silent and distinct', () => {
    const allRest = compileSchedule(request(['R8']), 10, { loops: 4 });
    const empty = compileSchedule(request([]), 10, { loops: 4 });
    const sparse = request([]);
    sparse.snapshot = freezeSnapshot(createDocument([eventFromPalette('N2', 480, 'later-note')]));
    const gap = compileSchedule(sparse, 10, { loops: 2 });
    expect(allRest.notes).toEqual([]);
    expect(allRest.unknownTicks).toBe(0);
    expect(empty.notes).toEqual([]);
    expect(empty.unknownTicks).toBe(1920);
    expect(gap.unknownTicks).toBe(1440);
    expect(gap.notes.map(note => [note.startSec, note.endSec])).toEqual([[13.75, 14.5], [16.75, 17.5]]);
  });

  it('accepts frozen snapshots and neither sorts nor edits source events or tempo', () => {
    const input = request(['N2', 'N2', 'R2', 'N2']);
    input.snapshot = freezeSnapshot({ ...input.snapshot, events: [...input.snapshot.events].reverse() });
    const original = structuredClone(input);
    const result = compileSchedule(input, 10, Object.freeze({ loops: 2, metronome: true }));
    expect(input).toEqual(original);
    expect(Object.isFrozen(input.snapshot.events[0].sourceValue)).toBe(true);
    expect(result.notes[0].startTick).toBe(0);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.notes)).toBe(true);
    expect(Object.isFrozen(result.notes[0])).toBe(true);
  });

  it('uses exactly one bar for performance and rejects calibration until its separate timeline exists', () => {
    expect(compileSchedule({ ...request(['N8']), purpose: 'performance' }, 10).loops).toBe(1);
    expect(() => compileSchedule({ ...request(['N8']), purpose: 'performance' }, 10, { loops: 2 })).toThrow('exactly one');
    expect(() => compileSchedule({ ...request(['N8']), purpose: 'performance' }, 10, { loops: 4 })).toThrow('exactly one');
    expect(() => compileSchedule({ ...request(['N8']), purpose: 'calibration' }, 10)).toThrow('calibration');
  });

  it.each([NaN, Infinity, -Infinity, -1, Number.MAX_VALUE])('rejects invalid/unsafe absolute start %s', start => {
    expect(() => compileSchedule(request(['N8']), start)).toThrow();
  });

  it.each([0, 3, -1, 1.5, NaN, Infinity, '2', null])('rejects invalid loop option %s', loops => {
    expect(() => compileSchedule(request(['N8']), 10, { loops } as AudioStartOptions)).toThrow();
  });

  it.each([null, [], false, { metronome: 'yes' }, { loops: 1, extra: true }])('rejects malformed options %j', options => {
    expect(() => compileSchedule(request(['N8']), 10, options as AudioStartOptions)).toThrow();
  });

  it('rejects mismatched identity and structurally invalid snapshots before scheduling', () => {
    const input = request(['N2', 'N2']);
    expect(() => compileSchedule({ ...input, runId: '' }, 10)).toThrow();
    expect(() => compileSchedule({ ...input, documentRevision: 1 }, 10)).toThrow('revision');
    const invalid = structuredClone(input);
    invalid.snapshot.events[1].startTick = 0;
    expect(() => compileSchedule(invalid, 10)).toThrow();
    invalid.snapshot.events[1].startTick = 1920;
    expect(() => compileSchedule(invalid, 10)).toThrow();
    invalid.snapshot.tempo.bpm = 0;
    expect(() => compileSchedule(invalid, 10)).toThrow();
  });
});

function fakeContext() {
  const gainParam = { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() };
  const gain = { gain: gainParam, connect: vi.fn(), disconnect: vi.fn() };
  const oscillator = { type: 'sine', frequency: { setValueAtTime: vi.fn() }, setPeriodicWave: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
  const context = { currentTime: 0, createPeriodicWave: vi.fn(() => ({})), createGain: vi.fn(() => gain), createOscillator: vi.fn(() => oscillator) };
  return { raw: context, context: context as unknown as BaseAudioContext, gain, oscillator, destination: {} as AudioNode };
}

describe('S07 one-source voice envelope and cleanup contract', () => {
  it('uses one oscillator with the stated harmonic ratio, attack, semantic release, and safety stop', () => {
    const fake = fakeContext();
    createSynthVoice(fake.context, fake.destination, 1, 1.75);
    expect(fake.raw.createOscillator).toHaveBeenCalledTimes(1);
    expect(fake.raw.createPeriodicWave).toHaveBeenCalledWith(new Float32Array([0, 0, 0]), new Float32Array([0, 1, .12]), { disableNormalization: false });
    expect(fake.oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(261.63, 1);
    expect(fake.oscillator.start).toHaveBeenCalledWith(1);
    expect(fake.gain.gain.setValueAtTime.mock.calls).toEqual([[0, 1], [1, 1.735]]);
    expect(fake.gain.gain.linearRampToValueAtTime.mock.calls).toEqual([[1, 1.005], [0, 1.75]]);
    expect(fake.oscillator.stop).toHaveBeenLastCalledWith(1.755);
  });

  it('short notes shorten release and attack so gain is zero at their semantic end', () => {
    const fake = fakeContext();
    createSynthVoice(fake.context, fake.destination, 0, .004);
    expect(fake.gain.gain.linearRampToValueAtTime.mock.calls).toEqual([[1, .0036], [0, .004]]);
    expect(fake.gain.gain.setValueAtTime.mock.calls).toEqual([[0, 0], [1, .0036]]);
  });

  it('fades active sources then disposes their nodes and callback exactly once on ended', () => {
    const fake = fakeContext();
    const onDisposed = vi.fn();
    const voice = createSynthVoice(fake.context, fake.destination, 1, 2, onDisposed);
    fake.raw.currentTime = 1.5;
    voice.stop();
    expect(voice.disposed).toBe(false);
    expect(fake.gain.disconnect).not.toHaveBeenCalled();
    expect(fake.oscillator.stop.mock.lastCall?.[0]).toBeCloseTo(1.51, 12);
    expect(fake.gain.gain.linearRampToValueAtTime.mock.calls.slice(-2)).toEqual([[1, 1.5], [0, 1.505]]);
    fake.raw.currentTime = 1.51;
    fake.oscillator.onended?.();
    voice.dispose();
    voice.stop();
    expect(voice.disposed).toBe(true);
    expect(fake.oscillator.disconnect).toHaveBeenCalledTimes(1);
    expect(fake.gain.disconnect).toHaveBeenCalledTimes(1);
    expect(onDisposed).toHaveBeenCalledTimes(1);
  });

  it('never extends a natural or previously requested stop and permits an earlier stop', () => {
    const fake = fakeContext();
    const voice = createSynthVoice(fake.context, fake.destination, 0, 2);
    voice.stop(3);
    expect(fake.oscillator.stop).toHaveBeenCalledTimes(1);
    voice.stop(1.5);
    const earlierStop = fake.oscillator.stop.mock.lastCall?.[0];
    voice.stop(1.8);
    voice.stop(1.5);
    expect(fake.oscillator.stop).toHaveBeenCalledTimes(2);
    expect(fake.oscillator.stop).toHaveBeenLastCalledWith(earlierStop);
    voice.stop(1);
    expect(fake.oscillator.stop.mock.lastCall?.[0]).toBeCloseTo(1.01, 12);
    expect(fake.oscillator.stop.mock.lastCall?.[0]).toBeLessThan(earlierStop!);
  });

  it('cancels and disconnects a future source immediately with no fade that could restart it', () => {
    const fake = fakeContext();
    const onDisposed = vi.fn();
    const voice = createSynthVoice(fake.context, fake.destination, 10, 11, onDisposed);
    const priorRampCount = fake.gain.gain.linearRampToValueAtTime.mock.calls.length;
    voice.stop();
    expect(fake.oscillator.stop).toHaveBeenLastCalledWith(0);
    expect(fake.gain.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(priorRampCount);
    expect(voice.disposed).toBe(true);
    voice.stop(5);
    voice.dispose();
    expect(onDisposed).toHaveBeenCalledTimes(1);
  });

  it('reconstructs a truncated attack ramp and caps a truncated release at semantic end', () => {
    const attack = fakeContext();
    const attackVoice = createSynthVoice(attack.context, attack.destination, 0, 1);
    attackVoice.stop(.002);
    expect(attack.gain.gain.cancelScheduledValues).toHaveBeenLastCalledWith(.002);
    expect(attack.gain.gain.linearRampToValueAtTime.mock.calls.slice(-2)).toEqual([[.4, .002], [0, .007]]);
    const release = fakeContext();
    const releaseVoice = createSynthVoice(release.context, release.destination, 0, 1);
    releaseVoice.stop(.998);
    const ramps = release.gain.gain.linearRampToValueAtTime.mock.calls.slice(-2);
    expect(ramps[0][0]).toBeCloseTo(.002 / .015, 12);
    expect(ramps[1]).toEqual([0, 1]);
    expect(release.oscillator.stop).toHaveBeenLastCalledWith(1.005);
  });

  it.each([.005, .985])('stops exactly at envelope boundary %s without gain discontinuity', timeSec => {
    const fake = fakeContext();
    const voice = createSynthVoice(fake.context, fake.destination, 0, 1);
    voice.stop(timeSec);
    expect(fake.gain.gain.linearRampToValueAtTime.mock.calls.slice(-2)).toEqual([[1, timeSec], [0, timeSec + .005]]);
  });

  it.each([false, true])('click accented=%s uses a short quiet sine source with natural disposal', accented => {
    const fake = fakeContext();
    const disposed = vi.fn();
    const voice = createClickVoice(fake.context, fake.destination, 0, accented, disposed);
    expect(fake.oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(accented ? 1320 : 880, 0);
    expect(fake.raw.createPeriodicWave).not.toHaveBeenCalled();
    expect(fake.gain.gain.linearRampToValueAtTime.mock.calls).toEqual([[.35, .005], [0, .045]]);
    fake.raw.currentTime = .05;
    fake.oscillator.onended?.();
    expect(voice.disposed).toBe(true);
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it.each([[NaN, 1], [-1, 1], [1, 1], [2, 1], [0, Infinity]])('rejects invalid voice bounds %j', (start, end) => {
    const fake = fakeContext();
    expect(() => createSynthVoice(fake.context, fake.destination, start, end)).toThrow();
    expect(fake.raw.createOscillator).not.toHaveBeenCalled();
  });
});
