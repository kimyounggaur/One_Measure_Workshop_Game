import { DomainError } from './errors';
import { isSafeInteger, safeMultiply, WHOLE_TICKS } from './time';
import type { Meter } from './types';

export const MVP_METER: Meter = { numerator: 4, denominator: 4, groupUnits: [1, 1, 1, 1] };
export function validateMeter(value: unknown): asserts value is Meter {
  if (typeof value !== 'object' || value === null || !('numerator' in value) || !isSafeInteger(value.numerator) || value.numerator <= 0 || !('denominator' in value) || typeof value.denominator !== 'number' || ![2, 4, 8, 16].includes(value.denominator) || !('groupUnits' in value) || !Array.isArray(value.groupUnits) || value.groupUnits.length === 0 || value.groupUnits.some(n => !isSafeInteger(n) || n <= 0)) {
    throw new DomainError('INVALID_METER', 'Meter has invalid numerator, denominator, or groups.');
  }
  let sum = 0;
  for (const group of value.groupUnits) {
    sum += group;
    if (!Number.isSafeInteger(sum)) throw new DomainError('INVALID_METER', 'Meter groups exceed safe range.');
  }
  if (sum !== value.numerator) throw new DomainError('INVALID_METER', 'Meter groups must sum to the numerator.');
  safeMultiply(WHOLE_TICKS, value.numerator);
}
export function barLengthTicks(meter: Meter): number {
  validateMeter(meter);
  return safeMultiply(WHOLE_TICKS, meter.numerator) / meter.denominator;
}
export function meterIdentity(meter: Meter): string {
  validateMeter(meter);
  return `${meter.numerator}/${meter.denominator}:${meter.groupUnits.join(',')}`;
}
export function validateMvpMeter(value: unknown): asserts value is Meter {
  validateMeter(value);
  if (meterIdentity(value) !== meterIdentity(MVP_METER)) throw new DomainError('UNSUPPORTED_MVP_METER', 'The MVP document supports 4/4 grouped as 1+1+1+1.');
}
