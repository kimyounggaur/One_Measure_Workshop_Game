import { describe, expect, it } from 'vitest';
import { ClockMapper, OUTPUT_SAMPLE_STALE_MS } from '../../src/audio/ClockMapper';

describe('S07 output clock mapping', () => {
  it('uses seconds -> milliseconds without double-counting latency', () => {
    const source = { currentTime: 10.1, baseLatency: 0.1, outputLatency: 0.1, getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 20000 }) };
    const clock = new ClockMapper(source, () => 20050);
    expect(clock.sample().mode).toBe('outputTimestamp');
    expect(clock.audioToPerformanceMs(10.5)).toBe(20500);
    expect(clock.performanceToAudioSec(20500)).toBe(10.5);
  });
  it.each([undefined, () => ({ contextTime: 0, performanceTime: 0 }), () => { throw new Error('unsupported'); }, () => ({ contextTime: NaN, performanceTime: 1000 })])('falls back on absent or invalid output samples', getOutputTimestamp => {
    const clock = new ClockMapper({ currentTime: 10, getOutputTimestamp }, () => 20000);
    expect(clock.sample().mode).toBe('anchorFallback');
    expect(clock.audioToPerformanceMs(10.5)).toBe(20500);
  });
  it('rejects stale and backwards samples with an explicit mode change', () => {
    let now = 20000;
    let stamp = { contextTime: 10, performanceTime: 20000 };
    const source = { currentTime: 10.1, getOutputTimestamp: () => stamp };
    const clock = new ClockMapper(source, () => now);
    clock.sample();
    now += OUTPUT_SAMPLE_STALE_MS + 1;
    source.currentTime += (OUTPUT_SAMPLE_STALE_MS + 1) / 1000;
    expect(clock.sample().modeChanged).toBe(true);
    const next = new ClockMapper(source, () => now);
    stamp = { contextTime: 10.5, performanceTime: now };
    next.sample();
    stamp = { contextTime: 10.4, performanceTime: now - 10 };
    expect(next.sample().modeChanged).toBe(true);
  });
  it('flags timeline jumps and never silently promotes fallback mid-run', () => {
    let now = 1000;
    let stamp = { contextTime: 0, performanceTime: 0 };
    const source = { currentTime: 1, getOutputTimestamp: () => stamp };
    const clock = new ClockMapper(source, () => now);
    clock.sample();
    source.currentTime = 1.1; now = 1100; stamp = { contextTime: 1.05, performanceTime: 1090 };
    expect(clock.sample()).toEqual({ mode: 'anchorFallback', modeChanged: false, discontinuity: false });
    source.currentTime = 2;
    expect(clock.sample().discontinuity).toBe(true);
  });
  it('rejects future performance or audio timestamps and includes the stale-age boundary', () => {
    const futurePerformance = new ClockMapper({ currentTime: 10, getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 20021 }) }, () => 20000);
    expect(futurePerformance.sample().mode).toBe('anchorFallback');
    const futureAudio = new ClockMapper({ currentTime: 10, getOutputTimestamp: () => ({ contextTime: 11, performanceTime: 20000 }) }, () => 20000);
    expect(futureAudio.sample().mode).toBe('anchorFallback');
    const boundary = new ClockMapper({ currentTime: 10.6, getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 20000 }) }, () => 20000 + OUTPUT_SAMPLE_STALE_MS);
    expect(boundary.sample().mode).toBe('outputTimestamp');
  });
});
