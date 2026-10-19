import measure01 from './puzzles/measure-01.json';
import measure02 from './puzzles/measure-02.json';
import measure03 from './puzzles/measure-03.json';
import measure04 from './puzzles/measure-04.json';
import measure05 from './puzzles/measure-05.json';
import measure06 from './puzzles/measure-06.json';
import { parsePuzzleCatalog } from './schema';

export const PUZZLES = parsePuzzleCatalog([measure01, measure02, measure03, measure04, measure05, measure06]);
export const puzzles = PUZZLES;
export function getPuzzle(id: string) {
  const puzzle = PUZZLES.find(item => item.id === id);
  if (!puzzle) throw new Error(`Unknown puzzle: ${id}`);
  return puzzle;
}
