import { describe, expect, it } from 'vitest';
import answers from '../fixtures/measure-answers.json';
import counterexamples from '../fixtures/counterexamples.json';
import { PUZZLES } from '../../src/content';
import { parseOracleTokens, validateContent } from '../../scripts/validate-content';
import { gradePuzzle } from '../../src/domain/grading';
import { parsePuzzleCatalog, validatePuzzle } from '../../src/content/schema';
import { fullSignature } from '../../src/domain/signatures';
import { eventFromPalette, eventsFromTokens, inventory } from '../../src/domain/rhythm';
import { validatePuzzleEdit } from '../../src/domain/constraints';

describe('S04 source oracle exact answer sets', () => {
  it('U13/U14 exhaustively verifies both differences of all six sets', () => {
    const results = validateContent(PUZZLES, answers);
    expect(results.map(result => result.answerCount)).toEqual([1, 1, 1, 3, 2, 1]);
    for (const result of results) console.info(`${result.puzzleId}: candidates=${result.candidateCount} semantic=${result.answerCount} answers=${JSON.stringify(result.answers.map(events => [...events].sort((a, b) => a.startTick - b.startTick).map(event => `${event.kind === 'note' ? 'N' : 'R'}${event.durationTick / 240}`)))}`);
  });
  for (const fixture of counterexamples) it(`${fixture.id}: expected ${fixture.code}`, () => {
    const puzzle = PUZZLES.find(item => item.id === fixture.puzzleId)!;
    const result = gradePuzzle(puzzle, parseOracleTokens(fixture.tokens, puzzle));
    expect(result.contentError).toBe(false);
    expect(result.objectivePass).toBe(false);
    expect(result.representativeError?.code).toBe(fixture.code);
    if (fixture.id === 'B04' || fixture.id === 'B08') expect(result.structurePass).toBe(true);
  });
  it('B05/U16 authoritative locks cannot be removed, renamed, moved, or falsified', () => {
    const puzzle = PUZZLES[1];
    const original = structuredClone(puzzle.initialEvents);
    const alterations = [
      original.filter(event => event.id !== 'initial-1'),
      original.map(event => event.id === 'initial-1' ? { ...event, locked: false } : event),
      original.map(event => event.id === 'initial-1' ? { ...event, id: 'spoofed', locked: true } : event),
      original.map(event => event.id === 'initial-1' ? { ...event, startTick: 240 } : event),
    ];
    for (const events of alterations) expect(gradePuzzle(puzzle, events).diagnostics.some(item => item.code === 'E_LOCKED')).toBe(true);
    expect(gradePuzzle(puzzle, original.map(event => ({ ...event, provenance: 'initial' }))).contentError).toBe(true);
    expect(validatePuzzleEdit(puzzle, original)).toEqual([]);
    expect(gradePuzzle(puzzle, original).contentError).toBe(false);
  });
  it('B06 empty third beat stays a gap and does not become a rest', () => {
    const events = eventsFromTokens(['N2', 'N2', 'R2', 'N2']).filter(event => event.kind === 'note');
    const result = gradePuzzle(PUZZLES[2], events);
    expect(result.representativeError?.code).toBe('E_GAP');
    expect(result.coverage?.restTicks).toBe(0);
    expect(result.coverage?.gaps).toEqual([{ startTick: 960, endTick: 1440 }]);
  });
  it('reports all relevant diagnostics in deterministic priority order', () => {
    const result = gradePuzzle(PUZZLES[4], eventsFromTokens(['R2', 'N2']));
    expect(result.diagnostics.map(item => item.code)).toEqual(['E_GAP', 'E_INVENTORY', 'E_FIRST_KIND']);
    const bad = [eventFromPalette('N2', 1680, 'a'), eventFromPalette('N1', 1680, 'b')];
    expect(gradePuzzle(PUZZLES[0], bad).diagnostics.map(item => item.code)).toEqual(['E_OVERFLOW', 'E_OVERLAP']);
  });
  it('B24 explanation response never revokes a correct objective', () => {
    const puzzle = PUZZLES[0];
    const events = parseOracleTokens(answers.puzzles[0].answers[0], puzzle);
    expect(gradePuzzle(puzzle, events)).toMatchObject({ structurePass: true, objectivePass: true, explanationPass: false });
    expect(gradePuzzle(puzzle, events, 'wrong')).toMatchObject({ objectivePass: true, explanationPass: false });
    expect(gradePuzzle(puzzle, events, puzzle.explanation.correctId).explanationPass).toBe(true);
  });
  it('semantic identity ignores array ordering and display IDs outside source locks', () => {
    for (const puzzle of PUZZLES.filter(item => item.id !== 'measure-02')) {
      const tokens = answers.puzzles.find(item => item.id === puzzle.id)!.answers[0];
      const events = parseOracleTokens(tokens, puzzle);
      const changed = [...events].reverse().map((event, i) => ({ ...event, id: `display-${i}` }));
      expect(fullSignature(changed)).toBe(fullSignature(events));
      expect(gradePuzzle(puzzle, changed).objectivePass).toBe(true);
      expect(inventory(changed)).toEqual(inventory(events));
    }
  });
  it('fails closed on unknown operators, missing references, zero answers, duplicates, and invalid focus', () => {
    expect(validatePuzzle({ ...PUZZLES[0], constraints: [{ op: 'eval', source: 'true' }] }).contentError).toBe(true);
    expect(validatePuzzle({ ...PUZZLES[2], references: {} }).contentError).toBe(true);
    expect(() => validateContent(PUZZLES.map((puzzle, i) => i === 0 ? { ...puzzle, expectedAnswerCount: 2 } : puzzle), answers)).toThrow('answer set mismatch');
    expect(() => validateContent(PUZZLES.map((puzzle, i) => i === 0 ? { ...puzzle, constraints: [{ op: 'fullCoverage' }, { op: 'inventory', counts: { N2: 1 } }] } : puzzle), answers)).toThrow('answer set mismatch');
    expect(() => parsePuzzleCatalog([PUZZLES[0], PUZZLES[0]])).toThrow('Duplicate puzzle');
    expect(validatePuzzle({ ...PUZZLES[0], hints: [{ level: 1, text: 'x', focus: { startTick: 0, endTick: 2400 } }, ...PUZZLES[0].hints.slice(1)] }).contentError).toBe(true);
  });
});
