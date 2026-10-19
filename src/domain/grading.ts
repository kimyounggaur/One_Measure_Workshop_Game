import { validatePuzzle } from '../content/schema';
import { evaluateRule, lockedDiagnostics, paletteDiagnostics } from './constraints';
import type { ConditionResult } from './constraints';
import { diagnostic } from './errors';
import type { Diagnostic } from './errors';
import { analyzeCoverage } from './rhythm';
import type { Coverage } from './rhythm';
import type { Puzzle } from './types';
import { validateEvents } from './validation';

export const GRADING_VERSION = '1';
export type GradeResult = {
  structurePass: boolean;
  objectivePass: boolean;
  explanationPass: boolean;
  contentError: boolean;
  diagnostics: Diagnostic[];
  representativeError?: Diagnostic;
  coverage?: Coverage;
  conditions: ConditionResult[];
};
const PRIORITY = ['E_SCHEMA', 'E_OVERFLOW', 'E_OVERLAP', 'E_LOCKED', 'E_GAP', 'E_PALETTE', 'E_INVENTORY', 'E_FIRST_KIND', 'E_REST_POSITION', 'E_ONSET', 'E_DURATION', 'E_SAME_RHYTHM', 'E_EXPLANATION'];
/** Schema failures are content errors, never learner attempts. Explanation is independent of unlock. */
export function gradePuzzle(puzzle: Puzzle, events: unknown, explanationId?: string): GradeResult {
  const content = validatePuzzle(puzzle);
  const validated = validateEvents(events);
  const base = { structurePass: false, objectivePass: false, explanationPass: false, contentError: false, diagnostics: [] as Diagnostic[], conditions: [] as ConditionResult[] };
  if (!content.ok || validated.contentError || !validated.value) {
    const diagnostics = !content.ok ? content.diagnostics : validated.diagnostics;
    return { ...base, contentError: true, diagnostics, representativeError: diagnostics[0] };
  }
  const documentEvents = validated.value;
  const diagnostics = [...validated.diagnostics, ...lockedDiagnostics(puzzle, documentEvents)];
  let coverage: Coverage | undefined;
  const conditions: ConditionResult[] = [];
  if (validated.ok) {
    coverage = analyzeCoverage(documentEvents);
    if (!coverage.fullCoverage) diagnostics.push(diagnostic('E_GAP', { conditionId: 'fullCoverage', spans: coverage.gaps }));
    diagnostics.push(...paletteDiagnostics(puzzle, documentEvents));
    for (const rule of puzzle.constraints) {
      const condition = evaluateRule(rule, puzzle, documentEvents);
      conditions.push(condition);
      if (condition.diagnostic && !diagnostics.some(item => item.code === condition.diagnostic?.code && item.conditionId === condition.diagnostic.conditionId)) diagnostics.push(condition.diagnostic);
    }
  }
  const structurePass = validated.ok && coverage?.fullCoverage === true && !diagnostics.some(item => item.code === 'E_LOCKED');
  const objectivePass = structurePass && !diagnostics.some(item => item.code !== 'E_EXPLANATION');
  const explanationPass = explanationId === puzzle.explanation.correctId;
  if (explanationId !== undefined && !explanationPass) diagnostics.push(diagnostic('E_EXPLANATION', { conditionId: 'explanation' }));
  diagnostics.sort((a, b) => PRIORITY.indexOf(a.code) - PRIORITY.indexOf(b.code));
  return { structurePass, objectivePass, explanationPass, contentError: false, diagnostics, representativeError: diagnostics[0], coverage, conditions };
}
