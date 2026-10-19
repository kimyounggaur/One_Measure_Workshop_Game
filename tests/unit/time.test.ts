import { describe, expect, it } from 'vitest';
import { durationToTicks, fraction, ticksToSeconds, validateFraction, validateMvpDuration, validateProductTempo } from '../../src/domain/time';
import { barLengthTicks, meterIdentity, validateMeter, validateMvpMeter } from '../../src/domain/meter';
import type { Meter } from '../../src/domain/types';

const simple: Meter = { numerator: 3, denominator: 4, groupUnits: [1, 1, 1] };
const compound: Meter = { numerator: 6, denominator: 8, groupUnits: [3, 3] };
describe('S02 exact rational time', () => {
  it('normalizes constructors and requires canonical storage', () => {
    expect(fraction(2, 8)).toEqual({ num: 1, den: 4 });
    expect(() => validateFraction({ num: 2, den: 8 })).toThrow('reduced');
    expect([8, 4, 2, 1].map(den => durationToTicks(fraction(1, den)))).toEqual([240, 480, 960, 1920]);
  });
  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid fraction component %s', value => {
    expect(() => fraction(value, 4)).toThrow();
    expect(() => fraction(1, value)).toThrow();
  });
  it('U18/F01 quarter80 gives 3 second bar and .375 second grid unit', () => {
    expect(ticksToSeconds(1920, { bpm: 80, beatUnit: fraction(1, 4) })).toBe(3);
    expect(ticksToSeconds(240, { bpm: 80, beatUnit: fraction(1, 4) })).toBe(.375);
  });
  it('U19–U21/F02–F04 calculate future meters without equating identity', () => {
    expect(ticksToSeconds(barLengthTicks(simple), { bpm: 80, beatUnit: fraction(1, 4) })).toBe(2.25);
    expect(ticksToSeconds(barLengthTicks(compound), { bpm: 80, beatUnit: fraction(3, 8) })).toBe(1.5);
    expect(ticksToSeconds(240, { bpm: 80, beatUnit: fraction(3, 8) })).toBe(.25);
    expect(ticksToSeconds(barLengthTicks(simple), { bpm: 120, beatUnit: fraction(1, 4) })).toBe(1.5);
    expect(meterIdentity(simple)).not.toBe(meterIdentity(compound));
    expect(() => validateMvpMeter(simple)).toThrow();
    expect(() => validateMvpMeter(compound)).toThrow();
  });
  it('U22/F05–F07 never rounds unrepresentable rationals or expands the MVP', () => {
    expect(() => durationToTicks(fraction(1, 7))).toThrow('exactly');
    expect(durationToTicks(fraction(1, 12))).toBe(160);
    expect(() => validateMvpDuration(160)).toThrow();
    expect(() => validateMvpDuration(720)).toThrow();
    expect(() => durationToTicks(fraction(Number.MAX_SAFE_INTEGER, 1))).toThrow('safe range');
  });
  it('rejects invalid meter grouping and unsafe multiplication', () => {
    expect(() => validateMeter({ ...simple, groupUnits: [1, 1] })).toThrow();
    expect(() => validateMeter({ ...simple, numerator: Number.MAX_SAFE_INTEGER, groupUnits: [Number.MAX_SAFE_INTEGER] })).toThrow();
    expect(meterIdentity({ numerator: 6, denominator: 8, groupUnits: [2, 2, 2] })).not.toBe(meterIdentity(compound));
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid bpm %s', bpm => {
    expect(() => ticksToSeconds(480, { bpm, beatUnit: fraction(1, 4) })).toThrow();
  });
  it('enforces product ranges and quarter units', () => {
    validateProductTempo({ bpm: 72, beatUnit: fraction(1, 4) }, 'puzzle');
    validateProductTempo({ bpm: 60, beatUnit: fraction(1, 4) }, 'listening');
    validateProductTempo({ bpm: 140, beatUnit: fraction(1, 4) }, 'free');
    validateProductTempo({ bpm: 80, beatUnit: fraction(1, 4) }, 'calibration');
    expect(() => validateProductTempo({ bpm: 101, beatUnit: fraction(1, 4) }, 'listening')).toThrow();
    expect(() => validateProductTempo({ bpm: 80, beatUnit: fraction(3, 8) }, 'free')).toThrow();
  });
  it('tempo doubles only halve seconds while exact ticks remain unchanged', () => {
    for (let bpm = 40; bpm <= 140; bpm += 5) {
      for (const ticks of [240, 480, 960, 1920]) expect(ticksToSeconds(ticks, { bpm: bpm * 2, beatUnit: fraction(1, 4) })).toBe(ticksToSeconds(ticks, { bpm, beatUnit: fraction(1, 4) }) / 2);
    }
  });
});
