import { analyzeCoverage, PALETTE, paletteId } from '../domain/rhythm';
import { isPlaybackPhase } from './machine';
import type { SessionState } from './machine';
import type { EditorState } from '../domain/commands';

export const selectDocument = (state: SessionState) => state.editor.document;
export const selectCanUndo = (editor: EditorState) => editor.past.length > 0;
export const selectCanRedo = (editor: EditorState) => editor.future.length > 0;
export const selectCanEdit = (state: SessionState) => !isPlaybackPhase(state.phase) && ['EDITING', 'FEEDBACK', 'THEORY_PASSED', 'VALIDATING', 'INTERRUPTED'].includes(state.phase);
export const selectCoverage = (editor: EditorState) => analyzeCoverage(editor.document.events);
export const selectActiveRun = (state: SessionState) => state.run;
export const selectSaveRequest = (state: SessionState) => state.saveRequest;
export const selectNextUnlocked = (state: SessionState, puzzleId: string) => state.progress[puzzleId]?.objectivePass === true;
export function selectEventList(editor: EditorState) {
  return [...editor.document.events].sort((left, right) => left.startTick - right.startTick).map(event => ({
    event, label: `${Math.floor(event.startTick / 480) + 1}번째 박 ${event.startTick % 480 === 0 ? '앞' : '뒤'}, ${PALETTE[paletteId(event)].name}, ${event.durationTick / 480}박 길이`,
    locked: editor.puzzle?.initialEvents.some(original => original.id === event.id && original.locked) ?? false,
  }));
}
