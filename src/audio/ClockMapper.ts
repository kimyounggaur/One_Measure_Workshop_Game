import type { ClockMode } from './types';

// Product thresholds, not browser latency/accuracy guarantees.
export const OUTPUT_SAMPLE_STALE_MS = 500;
export const OUTPUT_SAMPLE_FUTURE_TOLERANCE_MS = 20;
export const OUTPUT_CONTEXT_FUTURE_TOLERANCE_SEC = 0.02;
export const CLOCK_DISCONTINUITY_MS = 150;
export type ClockSource = Pick<AudioContext, 'currentTime'> & { getOutputTimestamp?: () => AudioTimestamp };
export type ClockSampleResult = { mode: ClockMode; modeChanged: boolean; discontinuity: boolean };

/** Maps audio seconds to the performance-ms timeline; never adds latency attributes. */
export class ClockMapper {
  private anchor = { contextTime: 0, performanceTime: 0 };
  private initialized = false;
  private lastAudioSec = 0;
  private _mode: ClockMode = 'anchorFallback';

  constructor(private readonly context: ClockSource, private readonly nowMs: () => number = () => performance.now()) {}
  get mode(): ClockMode { return this._mode; }

  sample(): ClockSampleResult {
    const now = this.nowMs();
    const audioSec = this.context.currentTime;
    let next = { contextTime: audioSec, performanceTime: now };
    let nextMode: ClockMode = 'anchorFallback';
    // Fallback does not silently promote mid-run; a new mapper retries native output.
    if ((!this.initialized || this._mode === 'outputTimestamp') && this.context.getOutputTimestamp) {
      try {
        const candidate = this.context.getOutputTimestamp();
        const c = candidate.contextTime;
        const p = candidate.performanceTime;
        if (typeof c === 'number' && typeof p === 'number' && Number.isFinite(c) && Number.isFinite(p) &&
            c >= 0 && p >= 0 && !(c === 0 && p === 0) && now - p <= OUTPUT_SAMPLE_STALE_MS &&
            c - audioSec <= OUTPUT_CONTEXT_FUTURE_TOLERANCE_SEC &&
            p - now <= OUTPUT_SAMPLE_FUTURE_TOLERANCE_MS &&
            (!this.initialized || (c >= this.anchor.contextTime && p >= this.anchor.performanceTime))) {
          next = { contextTime: c, performanceTime: p };
          nextMode = 'outputTimestamp';
        }
      } catch { /* Unsupported output sampling uses the explicit fallback. */ }
    }
    const modeChanged = this.initialized && this._mode !== nextMode;
    const previousOffset = this.anchor.performanceTime - 1000 * this.anchor.contextTime;
    const nextOffset = next.performanceTime - 1000 * next.contextTime;
    const discontinuity = !Number.isFinite(audioSec) || !Number.isFinite(now) ||
      (this.initialized && (audioSec < this.lastAudioSec ||
        (!modeChanged && Math.abs(nextOffset - previousOffset) > CLOCK_DISCONTINUITY_MS)));
    this._mode = nextMode;
    this.anchor = next;
    this.lastAudioSec = audioSec;
    this.initialized = true;
    return { mode: nextMode, modeChanged, discontinuity };
  }

  audioToPerformanceMs(audioSec: number): number {
    if (!this.initialized) this.sample();
    return this.anchor.performanceTime + 1000 * (audioSec - this.anchor.contextTime);
  }
  performanceToAudioSec(performanceMs: number): number {
    if (!this.initialized) this.sample();
    return this.anchor.contextTime + (performanceMs - this.anchor.performanceTime) / 1000;
  }
}
