import { parsePuzzleCatalog } from '../src/content/schema';
import { gradePuzzle } from '../src/domain/grading';
import { fullSignature } from '../src/domain/signatures';
import type { Puzzle, RhythmEvent } from '../src/domain/types';

/** Independent exhaustive generator: no objective conditions are used to create candidates. */
export function enumerateCandidates(puzzle: Puzzle): RhythmEvent[][] {
  const results: RhythmEvent[][] = [];
  const fixed = puzzle.initialEvents.filter(event => event.locked);
  // The L2 editable span is the only unlocked source event; all other bars start empty.
  const editable = fixed.length ? puzzle.initialEvents.filter(event => !event.locked) : [];
  const start = fixed.length ? editable[0].startTick : 0;
  const end = fixed.length ? editable[0].startTick + editable[0].durationTick : 1920;
  function walk(cursor: number, events: RhythmEvent[]) {
    if (cursor === end) {
      results.push([...structuredClone(fixed), ...events]);
      return;
    }
    for (const token of puzzle.palette) {
      const units = Number(token.slice(1));
      const ticks = units * 240;
      if (cursor + ticks > end) continue;
      const kind = token[0] === 'N' ? 'note' as const : 'rest' as const;
      const event: RhythmEvent = { id: `candidate-${events.length}-${cursor}`, kind, startTick: cursor, durationTick: ticks, sourceValue: { num: 1, den: 8 / units }, ...(kind === 'note' ? { pitch: 60 as const } : {}) };
      walk(cursor + ticks, [...events, event]);
    }
  }
  walk(start, []);
  return results;
}
/** Independent parser of the hand-written source oracle; intentionally no palette constructor. */
export function parseOracleTokens(tokens: readonly string[], puzzle: Puzzle): RhythmEvent[] {
  let cursor = 0;
  return tokens.map((token, index) => {
    if (!/^[NR](1|2|4|8)$/.test(token)) throw new Error('Invalid oracle token.');
    const units = Number(token.slice(1));
    const kind = token.startsWith('N') ? 'note' as const : 'rest' as const;
    const event: RhythmEvent = { id: `oracle-${index}`, kind, startTick: cursor, durationTick: units * 240, sourceValue: { num: 1, den: 8 / units }, ...(kind === 'note' ? { pitch: 60 as const } : {}) };
    cursor += event.durationTick;
    const original = puzzle.initialEvents.find(item => item.startTick === event.startTick && item.durationTick === event.durationTick && item.kind === event.kind);
    return original ? structuredClone(original) : event;
  });
}
export type ContentOracle = { puzzles: { id: string; answers: string[][]; answerCount: number }[] };
export type ContentVerification = { puzzleId: string; candidateCount: number; answerCount: number; answers: RhythmEvent[][]; signatures: string[] };
export function validateContent(values: unknown, oracle: ContentOracle): ContentVerification[] {
  const puzzles = parsePuzzleCatalog(values);
  if (puzzles.length !== 6 || oracle.puzzles.length !== 6) throw new Error('Exactly six puzzles are required.');
  return puzzles.map(puzzle => {
    const fixture = oracle.puzzles.find(item => item.id === puzzle.id);
    if (!fixture) throw new Error(`Missing independent oracle for ${puzzle.id}.`);
    const candidates = enumerateCandidates(puzzle);
    const accepted = new Map<string, RhythmEvent[]>();
    for (const candidate of candidates) {
      const grade = gradePuzzle(puzzle, candidate);
      if (grade.contentError) throw new Error(`Content error in ${puzzle.id}: ${grade.representativeError?.message}`);
      if (grade.structurePass && grade.objectivePass) accepted.set(fullSignature(candidate), candidate);
    }
    const actual = [...accepted.keys()].sort();
    const expected = [...new Set(fixture.answers.map(tokens => fullSignature(parseOracleTokens(tokens, puzzle))))].sort();
    if (!actual.length || actual.length !== puzzle.expectedAnswerCount || actual.length !== fixture.answerCount || JSON.stringify(actual) !== JSON.stringify(expected)) {
      const extra = actual.filter(signature => !expected.includes(signature));
      const missing = expected.filter(signature => !actual.includes(signature));
      throw new Error(`${puzzle.id} answer set mismatch; expected ${puzzle.expectedAnswerCount}, got ${actual.length}; extra=${JSON.stringify(extra)} missing=${JSON.stringify(missing)}`);
    }
    return { puzzleId: puzzle.id, candidateCount: candidates.length, answerCount: actual.length, answers: [...accepted.values()], signatures: actual };
  });
}
