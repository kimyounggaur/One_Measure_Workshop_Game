import { describe,it,expect } from 'vitest';
import { PUZZLES } from '../../src/content';
import { exampleSolution } from '../../src/content/learning';
import { createDocument } from '../../src/domain/rhythm';
import { createEditor,executeCommand } from '../../src/domain/commands';
import { gradePuzzle } from '../../src/domain/grading';
describe('disclosed examples are validated transactions',() => {
  for (const puzzle of PUZZLES) it(puzzle.id,() => {
    const initial = createEditor(createDocument(puzzle.initialEvents,'example',puzzle.tempo.default.bpm),puzzle);
    const result = executeCommand(initial,{type:'replaceEvents',events:exampleSolution(puzzle)});
    expect(result.committed).toBe(true);
    expect(gradePuzzle(puzzle,result.state.document.events).objectivePass).toBe(true);
    expect(executeCommand(result.state,{type:'undo'}).state.document.events).toEqual(initial.document.events);
  });
  it('rejects replacement that removes authoritative locked pieces',() => {
    const initial = createEditor(createDocument(PUZZLES[1].initialEvents,'locked',72),PUZZLES[1]);
    expect(executeCommand(initial,{type:'replaceEvents',events:[]}).state).toBe(initial);
  });
});
