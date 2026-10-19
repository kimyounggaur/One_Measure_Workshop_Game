import { DomainError } from './errors';
import type { Fraction, Tempo } from './types';

export const PPQ = 480 as const;
export const WHOLE_TICKS = 1920;
export const UNIT_TICKS = 240;
export const MVP_DURATIONS = [240, 480, 960, 1920] as const;

export function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}
export function assertTick(value: number): void {
  if (!isSafeInteger(value) || value < 0) throw new DomainError('UNSAFE_INTEGER', 'Tick must be a nonnegative safe integer.');
}
export function safeMultiply(a: number, b: number): number {
  const product = a * b;
  if (!Number.isSafeInteger(product)) throw new DomainError('UNSAFE_INTEGER', 'Integer multiplication exceeds safe range.');
  return product;
}
function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}
/** Constructors normalize; storage validators require an already canonical value. */
export function fraction(num: number, den: number): Fraction {
  if (!isSafeInteger(num) || !isSafeInteger(den) || num <= 0 || den <= 0) {
    throw new DomainError('INVALID_FRACTION', 'Length fractions need positive safe integer numerator and denominator.');
  }
  const divisor = gcd(num, den);
  return { num: num / divisor, den: den / divisor };
}
export const createFraction = fraction;
export function validateFraction(value: unknown): asserts value is Fraction {
  if (typeof value !== 'object' || value === null || !('num' in value) || !('den' in value)) {
    throw new DomainError('INVALID_FRACTION', 'Expected a fraction.');
  }
  if (typeof value.num !== 'number' || typeof value.den !== 'number') throw new DomainError('INVALID_FRACTION', 'Fraction values must be numbers.');
  const normalized = fraction(value.num, value.den);
  if (normalized.num !== value.num || normalized.den !== value.den) throw new DomainError('NON_CANONICAL_FRACTION', 'Stored fractions must be reduced.');
}
export function durationToTicks(value: Fraction): number {
  validateFraction(value);
  const scaled = safeMultiply(WHOLE_TICKS, value.num);
  if (scaled % value.den !== 0) throw new DomainError('UNSUPPORTED_RATIONAL_DURATION', 'The duration cannot be represented exactly at PPQ 480.');
  return scaled / value.den;
}
export const fractionToTicks = durationToTicks;
export function ticksToFraction(ticks: number): Fraction {
  assertTick(ticks);
  return fraction(ticks, WHOLE_TICKS);
}
export function validateMvpDuration(ticks: number): void {
  if (!MVP_DURATIONS.some(value => value === ticks)) throw new DomainError('UNSUPPORTED_MVP_DURATION', 'The MVP supports eighth, quarter, half, and whole values.');
}
export function validateTempo(value: unknown): asserts value is Tempo {
  if (typeof value !== 'object' || value === null || !('bpm' in value) || typeof value.bpm !== 'number' || !Number.isFinite(value.bpm) || value.bpm <= 0 || value.bpm > Number.MAX_SAFE_INTEGER || !('beatUnit' in value)) {
    throw new DomainError('INVALID_TEMPO', 'Tempo must have a positive finite bpm and beat unit.');
  }
  validateFraction(value.beatUnit);
  const scaled = value.bpm * 4 * value.beatUnit.num;
  if (!Number.isFinite(scaled) || scaled > Number.MAX_SAFE_INTEGER) throw new DomainError('INVALID_TEMPO', 'Tempo arithmetic exceeds safe range.');
}
export function quarterNotesPerMinute(tempo: Tempo): number {
  validateTempo(tempo);
  return tempo.bpm * 4 * tempo.beatUnit.num / tempo.beatUnit.den;
}
export function ticksToSeconds(ticks: number, tempo: Tempo): number {
  assertTick(ticks);
  const seconds = ticks / PPQ * 60 / quarterNotesPerMinute(tempo);
  if (!Number.isFinite(seconds)) throw new DomainError('INVALID_TEMPO', 'Tempo cannot produce a finite duration.');
  return seconds;
}
export type TempoContext = 'puzzle' | 'listening' | 'free' | 'calibration';
export const TEMPO_RANGES = {
  puzzle: { defaultBpm: 72, minBpm: 50, maxBpm: 120 },
  listening: { defaultBpm: 60, minBpm: 50, maxBpm: 100 },
  free: { defaultBpm: 80, minBpm: 40, maxBpm: 140 },
  calibration: { defaultBpm: 80, minBpm: 80, maxBpm: 80 },
} as const;
export function validateProductTempo(tempo: Tempo, context: TempoContext): void {
  validateTempo(tempo);
  const range = TEMPO_RANGES[context];
  if (!Number.isInteger(tempo.bpm) || tempo.bpm < range.minBpm || tempo.bpm > range.maxBpm || tempo.beatUnit.num !== 1 || tempo.beatUnit.den !== 4) {
    throw new DomainError('INVALID_TEMPO', `Tempo is outside the ${context} product range.`);
  }
}
