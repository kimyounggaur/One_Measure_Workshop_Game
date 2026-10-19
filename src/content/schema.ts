export { validateDocument, validateEvents } from '../domain/validation';
import { diagnostic, DomainError } from '../domain/errors';
import { validateMvpMeter } from '../domain/meter';
import { isPaletteId } from '../domain/rhythm';
import { isSafeInteger, TEMPO_RANGES, UNIT_TICKS, validateProductTempo, WHOLE_TICKS } from '../domain/time';
import { assertOnlyKeys, isRecord, validateEvents } from '../domain/validation';
import type { ValidationResult } from '../domain/validation';
import type { Puzzle, Rule, Tempo } from '../domain/types';

function fail(message: string): never { throw new DomainError('E_SCHEMA', message); }
function text(value: unknown, label: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) fail(`Invalid ${label}.`);
}
function assertRule(value: unknown, references: Record<string, unknown>): asserts value is Rule {
  if (!isRecord(value)) fail('Expected a rule object.');
  switch (value.op) {
    case 'fullCoverage': case 'lockedUnchanged':
      assertOnlyKeys(value, ['op']);
      return;
    case 'inventory':
      assertOnlyKeys(value, ['op', 'counts']);
      if (!isRecord(value.counts) || Object.keys(value.counts).length === 0) fail('Inventory needs counts.');
      for (const [token, count] of Object.entries(value.counts)) if (!isPaletteId(token) || !isSafeInteger(count) || count < 0 || count > 8) fail('Invalid inventory count.');
      return;
    case 'firstKind':
      assertOnlyKeys(value, ['op', 'kind']);
      if (value.kind !== 'note' && value.kind !== 'rest') fail('Invalid first kind.');
      return;
    case 'sameSemanticRhythm': case 'differentSilence':
      assertOnlyKeys(value, ['op', 'referenceId']);
      if (typeof value.referenceId !== 'string' || !Object.hasOwn(references, value.referenceId)) fail('Rule reference is missing.');
      return;
    default: fail('Unsupported rule operator.');
  }
}
export function validatePuzzle(value: unknown): ValidationResult<Puzzle> {
  try {
    if (!isRecord(value)) fail('Expected a puzzle object.');
    assertOnlyKeys(value, ['id', 'version', 'title', 'prompt', 'tempo', 'modelReferenceId', 'objectiveIds', 'meter', 'gridTick', 'initialEvents', 'palette', 'constraints', 'references', 'expectedAnswerCount', 'modelAvailable', 'hints', 'explanation', 'expectedConcept']);
    for (const key of ['id', 'title', 'prompt', 'expectedConcept']) text(value[key], key);
    if (!isSafeInteger(value.version) || value.version < 1 || !isSafeInteger(value.expectedAnswerCount) || value.expectedAnswerCount < 1) fail('Invalid content version or expected answer count.');
    validateMvpMeter(value.meter);
    if (value.gridTick !== UNIT_TICKS || typeof value.modelAvailable !== 'boolean') fail('Invalid puzzle grid or model availability.');
    if (!Array.isArray(value.objectiveIds) || !value.objectiveIds.length || value.objectiveIds.some(item => typeof item !== 'string' || !/^LO[1-6]$/.test(item))) fail('Invalid learning objective ids.');
    if (!isRecord(value.tempo)) fail('Missing tempo contract.');
    assertOnlyKeys(value.tempo, ['default', 'minBpm', 'maxBpm']);
    const context = value.id === 'measure-06' ? 'listening' : 'puzzle';
    const range = TEMPO_RANGES[context];
    validateProductTempo(value.tempo.default as Tempo, context);
    if ((value.tempo.default as Tempo).bpm !== range.defaultBpm || value.tempo.minBpm !== range.minBpm || value.tempo.maxBpm !== range.maxBpm) fail('Puzzle tempo range differs from the source contract.');
    if (!Array.isArray(value.palette) || value.palette.length === 0 || value.palette.some(token => !isPaletteId(token)) || new Set(value.palette).size !== value.palette.length) fail('Invalid palette.');
    const initial = validateEvents(value.initialEvents);
    if (!initial.ok) fail(`Invalid initial events: ${initial.diagnostics[0]?.message}`);
    if (!isRecord(value.references)) fail('Missing reference map.');
    for (const [referenceId, events] of Object.entries(value.references)) {
      if (['__proto__', 'constructor', 'prototype'].includes(referenceId)) fail('Unsafe reference key.');
      text(referenceId, 'reference id');
      const reference = validateEvents(events, { requireFullCoverage: true });
      if (!reference.ok) fail(`Invalid reference: ${referenceId}.`);
    }
    if (value.modelReferenceId !== undefined && (typeof value.modelReferenceId !== 'string' || !Object.hasOwn(value.references, value.modelReferenceId))) fail('Model reference is missing.');
    if (value.modelAvailable && value.modelReferenceId === undefined) fail('Available model needs a reference id.');
    if (!Array.isArray(value.constraints) || !value.constraints.length) fail('Missing constraints.');
    for (const rule of value.constraints) assertRule(rule, value.references);
    if (!value.constraints.some(rule => rule.op === 'fullCoverage')) fail('A puzzle must require full coverage.');
    if (initial.value?.some(event => event.locked) && !value.constraints.some(rule => rule.op === 'lockedUnchanged')) fail('Locked initial events need lockedUnchanged.');
    if (!Array.isArray(value.hints) || value.hints.length !== 3) fail('Exactly three hint levels are required.');
    for (const [index, hint] of value.hints.entries()) {
      if (!isRecord(hint) || hint.level !== index + 1) fail('Invalid hint level.');
      assertOnlyKeys(hint, ['level', 'text', 'focus']);
      text(hint.text, 'hint text');
      if (hint.focus !== undefined) {
        if (!isRecord(hint.focus)) fail('Invalid hint focus.');
        assertOnlyKeys(hint.focus, ['startTick', 'endTick']);
        if (!isSafeInteger(hint.focus.startTick) || !isSafeInteger(hint.focus.endTick) || hint.focus.startTick < 0 || hint.focus.endTick > WHOLE_TICKS || hint.focus.startTick >= hint.focus.endTick || hint.focus.startTick % UNIT_TICKS !== 0 || hint.focus.endTick % UNIT_TICKS !== 0) fail('Invalid hint focus range.');
      }
    }
    if (!isRecord(value.explanation)) fail('Missing explanation question.');
    assertOnlyKeys(value.explanation, ['prompt', 'options', 'correctId']);
    text(value.explanation.prompt, 'question');
    if (!Array.isArray(value.explanation.options) || value.explanation.options.length < 2) fail('Question needs options.');
    const optionIds: string[] = [];
    for (const option of value.explanation.options) {
      if (!isRecord(option)) fail('Invalid explanation option.');
      assertOnlyKeys(option, ['id', 'text']);
      text(option.id, 'option id'); text(option.text, 'option text');
      optionIds.push(option.id as string);
    }
    if (new Set(optionIds).size !== optionIds.length || typeof value.explanation.correctId !== 'string' || !optionIds.includes(value.explanation.correctId)) fail('Invalid explanation correct option.');
    return { ok: true, contentError: false, diagnostics: [], value: structuredClone(value) as Puzzle };
  } catch (error) {
    return { ok: false, contentError: true, diagnostics: [diagnostic('E_SCHEMA', {}, error instanceof Error ? error.message : 'Invalid puzzle.')] };
  }
}
export function parsePuzzle(value: unknown): Puzzle {
  const result = validatePuzzle(value);
  if (!result.ok || !result.value) throw new DomainError('E_SCHEMA', result.diagnostics[0]?.message ?? 'Invalid puzzle.');
  return result.value;
}
export function parsePuzzleCatalog(values: unknown): Puzzle[] {
  if (!Array.isArray(values)) fail('Expected a puzzle catalog.');
  const puzzles = values.map(parsePuzzle);
  if (new Set(puzzles.map(puzzle => puzzle.id)).size !== puzzles.length) fail('Duplicate puzzle id.');
  return puzzles;
}
