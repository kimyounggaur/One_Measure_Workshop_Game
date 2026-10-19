import { diagnostic } from './errors';
import type { Diagnostic } from './errors';
import { analyzeCoverage, inventory, paletteId } from './rhythm';
import { fullSignature, onsetSignature, silenceSignature } from './signatures';
import type { Puzzle, RhythmEvent, Rule } from './types';

function sameEvent(a: RhythmEvent, b: RhythmEvent): boolean {
  return a.id === b.id && fullSignature([a]) === fullSignature([b]) && a.sourceValue.num === b.sourceValue.num && a.sourceValue.den === b.sourceValue.den;
}
export function lockedDiagnostics(puzzle: Puzzle, events: readonly RhythmEvent[]): Diagnostic[] {
  const failures = puzzle.initialEvents.filter(original => original.locked && !events.some(event => sameEvent(original, event) && event.locked === true));
  return failures.length ? [diagnostic('E_LOCKED', { conditionId: 'lockedUnchanged', eventIds: failures.map(event => event.id) })] : [];
}
export function paletteDiagnostics(puzzle: Puzzle, events: readonly RhythmEvent[]): Diagnostic[] {
  const failures = events.filter(event => !puzzle.palette.includes(paletteId(event)) && !puzzle.initialEvents.some(original => sameEvent(original, event)));
  return failures.length ? [diagnostic('E_PALETTE', { conditionId: 'palette', eventIds: failures.map(event => event.id) })] : [];
}
/** For editor commands: permits gaps and incomplete objectives, enforces source locks and palette. */
export function validatePuzzleEdit(puzzle: Puzzle, events: readonly RhythmEvent[]): Diagnostic[] {
  return [...lockedDiagnostics(puzzle, events), ...paletteDiagnostics(puzzle, events)];
}
export type ConditionResult = { id: string; op: Rule['op']; pass: boolean; diagnostic?: Diagnostic };
export function evaluateRule(rule: Rule, puzzle: Puzzle, events: readonly RhythmEvent[]): ConditionResult {
  let failure: Diagnostic | undefined;
  const conditionId = rule.op;
  switch (rule.op) {
    case 'fullCoverage': {
      const coverage = analyzeCoverage(events);
      if (!coverage.fullCoverage) failure = diagnostic('E_GAP', { conditionId, spans: coverage.gaps });
      break;
    }
    case 'lockedUnchanged': failure = lockedDiagnostics(puzzle, events)[0]; break;
    case 'inventory': {
      const actual = inventory(events);
      const tokens = new Set([...Object.keys(actual), ...Object.keys(rule.counts)]);
      if ([...tokens].some(token => (actual[token as keyof typeof actual] ?? 0) !== (rule.counts[token as keyof typeof rule.counts] ?? 0))) {
        const message = puzzle.id === 'measure-02' ? '길이는 맞아요. 이번 주문은 그 한 박을 두 번 시작하는 소리로 바꾸는 거예요.' : undefined;
        failure = diagnostic('E_INVENTORY', { conditionId }, message);
      }
      break;
    }
    case 'firstKind':
      if ([...events].sort((a, b) => a.startTick - b.startTick)[0]?.kind !== rule.kind) failure = diagnostic('E_FIRST_KIND', { conditionId });
      break;
    case 'differentSilence':
      if (JSON.stringify(silenceSignature(events)) === JSON.stringify(silenceSignature(puzzle.references[rule.referenceId]))) failure = diagnostic('E_SAME_RHYTHM', { conditionId });
      break;
    case 'sameSemanticRhythm': {
      const reference = puzzle.references[rule.referenceId];
      if (fullSignature(events) !== fullSignature(reference)) {
        const actualOnsets = onsetSignature(events), expectedOnsets = onsetSignature(reference);
        const sameOnsets = JSON.stringify(actualOnsets) === JSON.stringify(expectedOnsets);
        const restMoved = actualOnsets[0] === expectedOnsets[0] && analyzeCoverage(events).restTicks === analyzeCoverage(reference).restTicks && JSON.stringify(silenceSignature(events)) !== JSON.stringify(silenceSignature(reference));
        failure = diagnostic(sameOnsets ? 'E_DURATION' : restMoved ? 'E_REST_POSITION' : 'E_ONSET', { conditionId });
      }
      break;
    }
  }
  return { id: conditionId, op: rule.op, pass: !failure, ...(failure ? { diagnostic: failure } : {}) };
}
