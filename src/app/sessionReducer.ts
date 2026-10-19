import { createEditor, executeCommand, previewCommand } from '../domain/commands';
import type { EditorCommand } from '../domain/commands';
import { diagnostic, DomainError } from '../domain/errors';
import type { Puzzle, RhythmDocument } from '../domain/types';
import { isPlaybackPhase, transitionMachine } from './machine';
import type { MachineEvent, SessionState } from './machine';

export { createSessionState } from './machine';
export type SessionIntent = MachineEvent
  | {type:'RESTORE_PROGRESS';progress:SessionState['progress']}
  | { type: 'LOAD_DOCUMENT'; document: RhythmDocument; puzzle?: Puzzle }
  | { type: 'EDIT_COMMAND'; command: EditorCommand; updatedAt?: string }
  | { type: 'PREVIEW_COMMAND'; command: EditorCommand }
  | { type: 'COMMIT_GHOST'; updatedAt?: string }
  | { type: 'SELECT_EVENT'; id?: string }
  | { type: 'CANCEL_GHOST' | 'POINTER_CANCEL' | 'LOST_POINTER_CAPTURE' | 'ORIENTATION_CHANGE' };

/** All edit paths (tap, list, keyboard, optional drag) enter the same transaction. */
export function sessionReducer(state: SessionState, intent: SessionIntent): SessionState {
  switch (intent.type) {
    case 'RESTORE_PROGRESS':return {...state,progress:structuredClone(intent.progress),effects:[]};
    case 'LOAD_DOCUMENT': {
      try {
        const editor = createEditor(intent.document, intent.puzzle);
        return { ...state, phase: 'EDITING', editor, serial: state.serial + 1, run: undefined, validation: undefined, saveRequest: undefined, savedRevision: undefined, saving: 'pending', feedback: undefined, performanceResult: undefined, selectedEventId: undefined, ghost: undefined, error: undefined, assistance: 'independent', mode: 'audio', effects: state.run ? [{ type: 'stopAudio', runId: state.run.runId }] : [] };
      } catch (error) {
        return { ...state, error: diagnostic(error instanceof DomainError ? error.code : 'E_SCHEMA', {}, '불러올 문서를 확인할 수 없어 현재 조립을 유지했어요.'), effects: [] };
      }
    }
    case 'EDIT_COMMAND': {
      if (isPlaybackPhase(state.phase) || !['EDITING', 'FEEDBACK', 'THEORY_PASSED', 'VALIDATING', 'INTERRUPTED'].includes(state.phase)) return state;
      const result = executeCommand(state.editor, intent.command, state.editor.puzzle, intent.updatedAt);
      if (!result.committed) return { ...state, ghost: undefined, error: result.error, effects: [] };
      return { ...state, phase: 'EDITING', editor: result.state, validation: undefined, saveRequest: undefined, saving: 'pending', feedback: undefined, ghost: undefined, error: undefined, effects: [] };
    }
    case 'PREVIEW_COMMAND': {
      if (isPlaybackPhase(state.phase)) return state;
      const result = previewCommand(state.editor, intent.command);
      return { ...state, ghost: result.document && result.changed ? { command: intent.command, document: result.document } : undefined, error: result.error, effects: [] };
    }
    case 'COMMIT_GHOST': return state.ghost ? sessionReducer(state, { type: 'EDIT_COMMAND', command: state.ghost.command, updatedAt: intent.updatedAt }) : state;
    case 'SELECT_EVENT': return { ...state, selectedEventId: state.editor.document.events.some(event => event.id === intent.id) ? intent.id : undefined, ghost: undefined, error: undefined, effects: [] };
    case 'CANCEL_GHOST': case 'POINTER_CANCEL': case 'LOST_POINTER_CAPTURE': return { ...state, ghost: undefined, effects: [] };
    case 'ORIENTATION_CHANGE': return isPlaybackPhase(state.phase) ? transitionMachine(state, { type: 'INTERRUPTED' }) : { ...state, ghost: undefined, effects: [] };
    default: return transitionMachine(state, intent);
  }
}
