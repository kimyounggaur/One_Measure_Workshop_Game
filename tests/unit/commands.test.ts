import { describe, expect, it } from 'vitest';
import { getPuzzle } from '../../src/content';
import { createEditor, executeCommand, HISTORY_LIMIT, previewCommand } from '../../src/domain/commands';
import type { EditorCommand, EditorState } from '../../src/domain/commands';
import { createDocument, eventFromPalette, eventsFromTokens } from '../../src/domain/rhythm';
import { fullSignature, onsetSignature } from '../../src/domain/signatures';

const now = '2026-10-19T00:00:00.000Z';
const blank = () => createEditor(createDocument([], 'commands', 80, now));
const run = (state: EditorState, command: EditorCommand) => {
  const result = executeCommand(state, command);
  expect(result.error).toBeUndefined();
  expect(result.committed).toBe(true);
  return result.state;
};

describe('transactional editor commands R05/R06/R17', () => {
  it.each<EditorCommand>([
    { type: 'place', event: eventFromPalette('N2', 0, 'placed') },
    { type: 'fillGapsWithRests' },
    { type: 'setTempo', bpm: 120 },
    { type: 'setTitle', title: '내 한 마디' },
  ])('$type undo/redo restores all content and IDs while revisions increase', command => {
    const before = blank();
    const after = run(before, command);
    const undone = run(after, { type: 'undo' });
    expect({ ...undone.document, revision: 0 }).toEqual(before.document);
    const redone = run(undone, { type: 'redo' });
    expect({ ...redone.document, revision: after.document.revision }).toEqual(after.document);
    expect(redone.document.revision).toBe(3);
    expect(before.document.events).toEqual([]);
  });

  it.each<EditorCommand>([
    { type: 'move', id: 'piece', startTick: 240 },
    { type: 'resize', id: 'piece', durationTick: 960 },
    { type: 'replaceKind', id: 'piece', kind: 'rest' },
    { type: 'splitAndRearticulate', id: 'piece' },
    { type: 'delete', id: 'piece' },
    { type: 'clear' },
  ])('$type undo is exact and redo reuses its event IDs', command => {
    const before = createEditor(createDocument([eventFromPalette('N2', 0, 'piece')], 'populated', 80, now));
    const after = run(before, command);
    const undone = run(after, { type: 'undo' });
    expect(undone.document.events).toEqual(before.document.events);
    expect(run(undone, { type: 'redo' }).document.events).toEqual(after.document.events);
  });

  it('B02/B03 invalid overflow or overlap preserves document, revision and stacks by identity', () => {
    const state = run(blank(), { type: 'place', event: eventFromPalette('N2', 0, 'one') });
    for (const event of [eventFromPalette('N2', 1680, 'overflow'), eventFromPalette('N2', 240, 'overlap')]) {
      const result = executeCommand(state, { type: 'place', event });
      expect(result.error?.code).toMatch(/E_OVERFLOW|E_OVERLAP/);
      expect(result.state).toBe(state);
      expect(result.state.past).toBe(state.past);
    }
  });

  it('move removes its original span, but never pushes or overwrites a neighbour', () => {
    const state = createEditor(createDocument([eventFromPalette('N2', 0, 'one'), eventFromPalette('N2', 960, 'two')], 'move', 80, now));
    const moved = run(state, { type: 'move', id: 'one', startTick: 240 });
    expect(moved.document.events[0].startTick).toBe(240);
    const conflict = executeCommand(moved, { type: 'move', id: 'one', startTick: 720 });
    expect(conflict.error?.code).toBe('E_OVERLAP');
    expect(conflict.state).toBe(moved);
  });

  it.each(['N2', 'N4', 'N8', 'R2', 'R4', 'R8'] as const)('splitting %s preserves length, note onsets add one and rests stay silent', token => {
    const state = createEditor(createDocument([eventFromPalette(token, 0, 'split')], 'split', 80, now));
    const next = run(state, { type: 'splitAndRearticulate', id: 'split' });
    expect(next.document.events.reduce((sum, event) => sum + event.durationTick, 0)).toBe(state.document.events[0].durationTick);
    expect(onsetSignature(next.document.events).length).toBe(token.startsWith('N') ? 2 : 0);
    if (token.startsWith('R')) expect(fullSignature(next.document.events)).toBe(fullSignature(state.document.events));
  });

  it('B21/B22 only supported adjacent rest totals can merge; notes retain onsets', () => {
    const state = createEditor(createDocument(eventsFromTokens(['R1', 'R1']), 'rests', 80, now));
    const merged = run(state, { type: 'mergeAdjacentRests', ids: ['event-1', 'event-2'] });
    expect(merged.document.events).toHaveLength(1);
    expect(merged.document.events[0].durationTick).toBe(480);
    expect(run(merged, { type: 'undo' }).document.events).toEqual(state.document.events);
    for (const tokens of [['R1', 'R2'], ['N1', 'N1']] as const) {
      const invalid = createEditor(createDocument(eventsFromTokens(tokens), 'invalid', 80, now));
      expect(executeCommand(invalid, { type: 'mergeAdjacentRests', ids: ['event-1', 'event-2'] }).state).toBe(invalid);
    }
  });

  it('B05 L2 authoritative locks survive forged locked=false and clear, editable beat splits', () => {
    const puzzle = getPuzzle('measure-02');
    const state = createEditor(createDocument(puzzle.initialEvents, puzzle.id, 72, now), puzzle);
    const locked = puzzle.initialEvents.find(event => event.locked)!;
    for (const command of [{ type: 'delete', id: locked.id }, { type: 'move', id: locked.id, startTick: 240 }, { type: 'resize', id: locked.id, durationTick: 240 }] satisfies EditorCommand[]) {
      expect(executeCommand(state, command).error?.code).toBe('E_LOCKED');
      expect(executeCommand(state, command).state).toBe(state);
    }
    const editable = puzzle.initialEvents.find(event => !event.locked)!;
    const split = run(state, { type: 'splitAndRearticulate', id: editable.id });
    expect(split.document.events.filter(event => !event.locked)).toHaveLength(2);
    expect(run(state, { type: 'clear' }).document.events).toEqual(puzzle.initialEvents.filter(event => event.locked));
    expect(() => createEditor({ ...state.document, events: state.document.events.map(event => ({ ...event, locked: false })) }, puzzle)).toThrow();
  });

  it('B20 fill is free-only, uses largest fitting rests left-to-right and one history entry', () => {
    const state = createEditor(createDocument([eventFromPalette('N1', 720, 'middle')], 'fill', 80, now));
    const preview = previewCommand(state, { type: 'fillGapsWithRests' });
    expect(state.document.events).toHaveLength(1);
    expect(state.past).toHaveLength(0);
    expect(preview.document?.events.filter(event => event.kind === 'rest').map(event => [event.startTick, event.durationTick])).toEqual([[0, 480], [480, 240], [960, 960]]);
    const filled = run(state, { type: 'fillGapsWithRests' });
    expect(filled.past).toHaveLength(1);
    expect(run(filled, { type: 'undo' }).document.events).toEqual(state.document.events);
    const puzzleState = createEditor(createDocument([], 'puzzle', 72, now), getPuzzle('measure-01'));
    expect(executeCommand(puzzleState, { type: 'fillGapsWithRests' }).error?.conditionId).toBe('free-mode-only');
  });

  it('history is a 100-command ring and a new edit clears redo', () => {
    let state = blank();
    for (let i = 0; i < 110; i++) state = run(state, { type: 'setTitle', title: `작품 ${i}` });
    expect(state.past).toHaveLength(HISTORY_LIMIT);
    state = run(state, { type: 'undo' });
    expect(state.future).toHaveLength(1);
    state = run(state, { type: 'setTitle', title: '새 이름' });
    expect(state.future).toHaveLength(0);
  });

  it('tempo and title runtime guards reject invalid changes without committing', () => {
    const puzzle = getPuzzle('measure-06');
    const state = createEditor(createDocument([], 'tempo', 60, now), puzzle);
    expect(executeCommand(state, { type: 'setTempo', bpm: 101 }).state).toBe(state);
    expect(executeCommand(blank(), { type: 'setTempo', bpm: 39 }).committed).toBe(false);
    expect(executeCommand(blank(), { type: 'setTempo', bpm: 140 }).committed).toBe(true);
    expect(executeCommand(state, { type: 'setTitle', title: '가'.repeat(41) }).state).toBe(state);
  });
});
