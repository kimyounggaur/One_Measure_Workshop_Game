import { diagnostic, DomainError } from './errors';
import type { Diagnostic } from './errors';
import { durationToTicks, isSafeInteger, validateFraction, validateMvpDuration, validateProductTempo, UNIT_TICKS, WHOLE_TICKS } from './time';
import { validateMvpMeter } from './meter';
import { analyzeCoverage } from './rhythm';
import type { RhythmDocument, RhythmEvent } from './types';

export type ValidationResult<T> = { ok: boolean; contentError: boolean; diagnostics: Diagnostic[]; value?: T };
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function assertOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key) || ['__proto__', 'prototype', 'constructor'].includes(key))) throw new DomainError('E_SCHEMA', 'Unexpected or unsafe data field.');
}
function schemaFailure(message: string): never { throw new DomainError('E_SCHEMA', message); }
export function assertEventSchema(value: unknown): asserts value is RhythmEvent {
  if (!isRecord(value)) schemaFailure('Expected an event object.');
  assertOnlyKeys(value, ['id', 'kind', 'startTick', 'durationTick', 'pitch', 'sourceValue', 'locked']);
  if (typeof value.id !== 'string' || !value.id || value.id.length > 128) schemaFailure('Event id is missing or too long.');
  if (value.kind !== 'note' && value.kind !== 'rest') schemaFailure('Unsupported event kind.');
  if (!isSafeInteger(value.startTick) || value.startTick < 0 || value.startTick % UNIT_TICKS !== 0) schemaFailure('startTick must be a nonnegative grid-aligned safe integer.');
  if (!isSafeInteger(value.durationTick)) schemaFailure('durationTick must be a safe integer.');
  validateMvpDuration(value.durationTick);
  if (!isRecord(value.sourceValue)) schemaFailure('Expected a source value.');
  assertOnlyKeys(value.sourceValue, ['num', 'den']);
  validateFraction(value.sourceValue);
  if (durationToTicks(value.sourceValue) !== value.durationTick) schemaFailure('Source value contradicts durationTick.');
  if (value.kind === 'note' && value.pitch !== 60) schemaFailure('A note must have MIDI pitch 60.');
  if (value.kind === 'rest' && 'pitch' in value) schemaFailure('A rest must not have a pitch.');
  if ('locked' in value && typeof value.locked !== 'boolean') schemaFailure('locked must be a boolean.');
}
export function validateEvents(value: unknown, options: { requireFullCoverage?: boolean; barTicks?: number } = {}): ValidationResult<RhythmEvent[]> {
  const barTicks = options.barTicks ?? WHOLE_TICKS;
  try {
    if (!Array.isArray(value) || value.length > 8) schemaFailure('Expected at most eight events.');
    const ids = new Set<string>();
    for (const event of value) {
      assertEventSchema(event);
      if (ids.has(event.id)) schemaFailure('Duplicate event id.');
      ids.add(event.id);
    }
  } catch (error) {
    return { ok: false, contentError: true, diagnostics: [diagnostic('E_SCHEMA', {}, error instanceof Error ? error.message : 'Invalid events.')] };
  }
  const events = value as RhythmEvent[];
  const ordered = [...events].sort((a, b) => a.startTick - b.startTick);
  const diagnostics: Diagnostic[] = [];
  for (const event of ordered) {
    if (!Number.isSafeInteger(event.startTick + event.durationTick) || event.startTick + event.durationTick > barTicks) diagnostics.push(diagnostic('E_OVERFLOW', { eventIds: [event.id] }));
  }
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      if (ordered[j].startTick < ordered[i].startTick + ordered[i].durationTick) diagnostics.push(diagnostic('E_OVERLAP', { eventIds: [ordered[i].id, ordered[j].id] }));
    }
  }
  if (options.requireFullCoverage && diagnostics.length === 0) {
    const coverage = analyzeCoverage(events, barTicks);
    if (!coverage.fullCoverage) diagnostics.push(diagnostic('E_GAP', { spans: coverage.gaps }));
  }
  return { ok: diagnostics.length === 0, contentError: false, diagnostics, value: structuredClone(events) };
}
export function validateDocument(value: unknown): ValidationResult<RhythmDocument> {
  try {
    if (!isRecord(value)) schemaFailure('Expected a document.');
    assertOnlyKeys(value, ['schemaVersion', 'id', 'contentVersion', 'revision', 'ppq', 'meter', 'tempo', 'events', 'title', 'createdAt', 'updatedAt']);
    if (value.schemaVersion !== 1 || value.ppq !== 480 || !isSafeInteger(value.revision) || value.revision < 0) schemaFailure('Invalid document version, PPQ, or revision.');
    if (typeof value.id !== 'string' || !value.id || value.id.length > 128 || typeof value.contentVersion !== 'string' || !value.contentVersion || value.contentVersion.length > 64) schemaFailure('Invalid document identity.');
    if (value.title !== undefined && (typeof value.title !== 'string' || [...value.title].length > 40)) schemaFailure('A title must be at most 40 characters.');
    for (const field of ['createdAt', 'updatedAt']) if (typeof value[field] !== 'string' || !Number.isFinite(Date.parse(value[field]))) schemaFailure('Invalid document timestamp.');
    if (!isRecord(value.meter) || !isRecord(value.tempo)) schemaFailure('Missing meter or tempo.');
    assertOnlyKeys(value.meter, ['numerator', 'denominator', 'groupUnits']);
    assertOnlyKeys(value.tempo, ['bpm', 'beatUnit']);
    if (!isRecord(value.tempo.beatUnit)) schemaFailure('Missing beat unit.');
    assertOnlyKeys(value.tempo.beatUnit, ['num', 'den']);
    validateMvpMeter(value.meter);
    validateProductTempo(value.tempo as unknown as RhythmDocument['tempo'], 'free');
    const eventsResult = validateEvents(value.events);
    if (!eventsResult.ok) return { ...eventsResult, value: undefined };
    return { ok: true, contentError: false, diagnostics: [], value: structuredClone(value) as RhythmDocument };
  } catch (error) {
    return { ok: false, contentError: true, diagnostics: [diagnostic('E_SCHEMA', {}, error instanceof Error ? error.message : 'Invalid document.')] };
  }
}
export function parseDocument(value: unknown): RhythmDocument {
  const result = validateDocument(value);
  if (!result.ok || !result.value) throw new DomainError('E_SCHEMA', result.diagnostics[0]?.message ?? 'Invalid document.');
  return result.value;
}
