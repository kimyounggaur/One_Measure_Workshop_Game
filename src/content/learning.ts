import { eventsFromTokens } from '../domain/rhythm';
import type { PaletteId, Puzzle, RhythmEvent } from '../domain/types';

const examples: Record<string, PaletteId[]> = {
  'measure-01':['N2','N2','N2','N2'], 'measure-02':['N2','N1','N1','N2','N2'],
  'measure-03':['N2','N2','R2','N2'], 'measure-04':['N4','N2','N2'],
  'measure-05':['N2','R2','N2','N2'], 'measure-06':['R1','N1','N2','N1','R1','N2'],
};
/** One disclosed example; the grader continues to accept every valid solution. */
export function exampleSolution(puzzle: Puzzle): RhythmEvent[] {
  return eventsFromTokens(examples[puzzle.id],`solution-${puzzle.id}`).map(event => {
    const locked = puzzle.initialEvents.find(original => original.locked && original.startTick === event.startTick);
    return locked ? structuredClone(locked) : event;
  });
}
