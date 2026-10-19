import { createEditor } from '../domain/commands';
import type { EditorState } from '../domain/commands';
import type { Diagnostic } from '../domain/errors';
import type { GradeResult } from '../domain/grading';
import { fullSignature } from '../domain/signatures';
import type { Puzzle, RhythmDocument, RhythmEvent } from '../domain/types';
import { validateDocument } from '../domain/validation';

export type SessionPhase = 'BOOT' | 'LOADING_LOCAL' | 'HOME' | 'RECOVERY' | 'AUDIO_SETUP' | 'TUTORIAL' | 'EDITING' | 'PREVIEW_PREPARING' | 'COUNT_IN' | 'PREVIEW_PLAYING' | 'VALIDATING' | 'FEEDBACK' | 'THEORY_PASSED' | 'PERFORMANCE_PREPARING' | 'PERFORMING' | 'PERFORMANCE_RESULT' | 'CALIBRATION_PREPARING' | 'CALIBRATING' | 'CALIBRATION_RESULT' | 'INTERRUPTED' | 'CONTENT_ERROR';
export type RunPurpose = 'preview' | 'performance' | 'calibration';
export type AsyncIdentity = { runId: string; documentRevision: number };
export type InputBounds = { rawStartMs: number; rawEndMs: number; barEndMs: number };
export type SnapshotRequest = AsyncIdentity & { snapshot: RhythmDocument };
export type ActiveRun = SnapshotRequest & { purpose: RunPurpose; barComplete: boolean; rawTapsMs: number[]; inputBounds?: InputBounds };
export type PuzzleProgress = {
  puzzleId: string;
  puzzleVersion: number;
  objectivePass: boolean;
  explanationReviewed: boolean;
  completedBy: 'independent' | 'hinted' | 'solutionViewed' | 'notCompleted';
  mode: 'audio' | 'visualAlternative';
  attempts: number;
  bestTheorySnapshot?: RhythmDocument;
  discoveredSignatures: string[];
};
export type PerformanceSummary = { targets: number; matched: number; missed: number; extras: number; confidence: 'normal' | 'practiceOnly' | 'lowConfidence' | 'invalidated' | 'notApplicable' };
export type SessionEffect =
  | { type: 'prepareAudio'; request: ActiveRun }
  | { type: 'stopAudio'; runId: string }
  | { type: 'validate'; request: SnapshotRequest }
  | { type: 'save'; request: SnapshotRequest; progress: Record<string, PuzzleProgress> }
  | { type: 'calculatePerformance'; request: ActiveRun }
  | { type: 'calculateCalibration'; request: ActiveRun };
export type SessionState = {
  phase: SessionPhase;
  editor: EditorState;
  serial: number;
  run?: ActiveRun;
  validation?: SnapshotRequest;
  saving: 'clean' | 'pending' | 'saving' | 'failed';
  saveRequest?: SnapshotRequest;
  savedRevision?: number;
  storageError?: string;
  feedback?: GradeResult;
  progress: Record<string, PuzzleProgress>;
  assistance: 'independent' | 'hinted' | 'solutionViewed';
  mode: 'audio' | 'visualAlternative';
  performanceResult?: PerformanceSummary;
  ghost?: { command: import('../domain/commands').EditorCommand; document: RhythmDocument };
  selectedEventId?: string;
  error?: Diagnostic;
  effects: SessionEffect[];
};
export type MachineEvent =
  | { type: 'LOAD_LOCAL' }
  | { type: 'LOCAL_READY'; recovery?: boolean }
  | { type: 'OPEN_EDITOR' | 'OPEN_TUTORIAL' | 'OPEN_AUDIO_SETUP' | 'BACK_TO_EDITOR' | 'LEAVE' | 'STOP' | 'HIDDEN' | 'INTERRUPTED' | 'REQUEST_SAVE' | 'SUBMIT' | 'PLAY_PERFORMANCE' | 'START_CALIBRATION' | 'ACCEPT_EXPLANATION' | 'CLOSE_RESULT' }
  | { type: 'PLAY_PREVIEW'; previewEvents?: RhythmEvent[] }
  | { type: 'SET_ASSISTANCE'; assistance: SessionState['assistance'] }
  | { type: 'SET_MODE'; mode: SessionState['mode'] }
  | ({ type: 'AUDIO_READY'; inputBounds?: InputBounds } & AsyncIdentity)
  | ({ type: 'AUDIO_INTERRUPTED'; reason?: string } & AsyncIdentity)
  | ({ type: 'COUNT_IN_ENDED'; purpose: RunPurpose } & AsyncIdentity)
  | ({ type: 'BAR_COMPLETE' } & AsyncIdentity)
  | ({ type: 'INPUT_WINDOW_CLOSED'; nowMs: number; inputBounds?:InputBounds } & AsyncIdentity)
  | ({ type: 'TAP'; timestampMs: number; inputBounds?:InputBounds } & AsyncIdentity)
  | ({ type: 'VALIDATION_DONE'; result: GradeResult } & AsyncIdentity)
  | ({ type: 'PERFORMANCE_RESULT_READY'; result: PerformanceSummary } & AsyncIdentity)
  | ({ type: 'SAVE_STARTED' | 'SAVE_SUCCEEDED' } & AsyncIdentity)
  | ({ type: 'SAVE_FAILED'; message: string } & AsyncIdentity)
  | { type: 'CONTENT_ERROR'; error: Diagnostic };

export function freezeSnapshot(document: RhythmDocument): RhythmDocument {
  const snapshot = structuredClone(document);
  function freeze(value: unknown): void {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  freeze(snapshot);
  return snapshot;
}
export function createSessionState(document: RhythmDocument, puzzle?: Puzzle, phase: SessionPhase = 'EDITING'): SessionState {
  return { phase, editor: createEditor(document, puzzle), serial: 0, saving: 'clean', progress: {}, assistance: 'independent', mode: 'audio', effects: [] };
}
export function isPlaybackPhase(phase: SessionPhase): boolean {
  return ['PREVIEW_PREPARING', 'COUNT_IN', 'PREVIEW_PLAYING', 'PERFORMANCE_PREPARING', 'PERFORMING', 'CALIBRATION_PREPARING', 'CALIBRATING'].includes(phase);
}
function matches(state: SessionState, request: AsyncIdentity | undefined, event: AsyncIdentity): boolean {
  return !!request && request.runId === event.runId && request.documentRevision === event.documentRevision && state.editor.document.revision === event.documentRevision;
}
function snapshotRequest(state: SessionState, label: string): SnapshotRequest {
  return { runId: `${state.editor.document.id}:${label}:${state.serial + 1}`, documentRevision: state.editor.document.revision, snapshot: freezeSnapshot(state.editor.document) };
}
function withoutPending(state: SessionState): SessionState {
  return { ...state, run: undefined, validation: undefined, saveRequest: undefined, ghost: undefined, saving: state.saving === 'saving' ? 'pending' : state.saving, effects: [] };
}
export function requestSave(state: SessionState): SessionState {
  const request = snapshotRequest(state, 'save');
  return { ...state, serial: state.serial + 1, saving: 'pending', saveRequest: request, storageError: undefined, effects: [...state.effects, { type: 'save', request, progress: structuredClone(state.progress) }] };
}
function renewInvalidatedSave(previous: SessionState, next: SessionState): SessionState {
  return previous.saveRequest || previous.saving === 'saving' ? requestSave(next) : next;
}
function beginRun(state: SessionState, purpose: RunPurpose, previewEvents?: RhythmEvent[]): SessionState {
  const previousFinishedRun = state.run && ['PERFORMANCE_RESULT', 'CALIBRATION_RESULT'].includes(state.phase) ? state.run : undefined;
  if ((state.run && !previousFinishedRun) || isPlaybackPhase(state.phase) || state.phase === 'VALIDATING') return state;
  if (!['EDITING', 'THEORY_PASSED', 'FEEDBACK', 'AUDIO_SETUP', 'PERFORMANCE_RESULT', 'CALIBRATION_RESULT', 'INTERRUPTED'].includes(state.phase)) return state;
  if (purpose === 'performance' && state.editor.puzzle && !state.progress[state.editor.puzzle.id]?.objectivePass) return state;
  const document = previewEvents ? { ...state.editor.document, events: previewEvents } : state.editor.document;
  if (!validateDocument(document).ok) return state;
  // Performance always follows the learner's accepted snapshot, including L4/L5 alternatives.
  const accepted = purpose === 'performance' && state.editor.puzzle ? state.progress[state.editor.puzzle.id]?.bestTheorySnapshot : undefined;
  if (accepted && fullSignature(accepted.events) !== fullSignature(state.editor.document.events)) return state;
  const run: ActiveRun = { ...snapshotRequest(state, purpose), snapshot: freezeSnapshot(document), purpose, barComplete: false, rawTapsMs: [] };
  const next = withoutPending(state);
  return requestSave({ ...next, phase: purpose === 'preview' ? 'PREVIEW_PREPARING' : purpose === 'performance' ? 'PERFORMANCE_PREPARING' : 'CALIBRATION_PREPARING', serial: state.serial + 1, run, performanceResult: undefined, error: undefined, effects: [...(previousFinishedRun ? [{ type: 'stopAudio' as const, runId: previousFinishedRun.runId }] : []), { type: 'prepareAudio', request: run }] });
}

/** Pure state transitions. Browser/audio/storage adapters execute the explicit effects. */
export function transitionMachine(state: SessionState, event: MachineEvent): SessionState {
  switch (event.type) {
    case 'LOAD_LOCAL': return state.phase === 'BOOT' ? { ...state, phase: 'LOADING_LOCAL', effects: [] } : state;
    case 'LOCAL_READY': return state.phase === 'LOADING_LOCAL' ? { ...state, phase: event.recovery ? 'RECOVERY' : 'HOME', effects: [] } : state;
    case 'OPEN_EDITOR': return renewInvalidatedSave(state, { ...withoutPending(state), phase: 'EDITING', effects: state.run ? [{ type: 'stopAudio', runId: state.run.runId }] : [] });
    case 'OPEN_TUTORIAL': return state.phase === 'HOME' ? { ...state, phase: 'TUTORIAL', effects: [] } : state;
    case 'OPEN_AUDIO_SETUP': return state.phase === 'HOME' ? { ...state, phase: 'AUDIO_SETUP', effects: [] } : state;
    case 'BACK_TO_EDITOR': return renewInvalidatedSave(state, { ...withoutPending(state), phase: state.editor.puzzle && state.progress[state.editor.puzzle.id]?.objectivePass ? 'THEORY_PASSED' : 'EDITING', effects: state.run ? [{ type: 'stopAudio', runId: state.run.runId }] : [] });
    case 'PLAY_PREVIEW': return beginRun(state, 'preview', event.previewEvents);
    case 'PLAY_PERFORMANCE': return beginRun(state, 'performance');
    case 'START_CALIBRATION': return beginRun(state, 'calibration');
    case 'AUDIO_READY':
      if (!matches(state, state.run, event) || !state.run || !['PREVIEW_PREPARING', 'PERFORMANCE_PREPARING', 'CALIBRATION_PREPARING'].includes(state.phase)) return state;
      if (event.inputBounds && (!Object.values(event.inputBounds).every(Number.isFinite) || event.inputBounds.rawStartMs > event.inputBounds.rawEndMs)) return state;
      return { ...state, phase: 'COUNT_IN', run: { ...state.run, inputBounds: event.inputBounds }, effects: [] };
    case 'AUDIO_INTERRUPTED':
      // Re-check inside the reducer: an older callback can already be queued
      // when document replacement or a new run updates the current identity.
      return matches(state, state.run, event) ? transitionMachine(state, { type: 'INTERRUPTED' }) : state;
    case 'COUNT_IN_ENDED':
      if (!matches(state, state.run, event) || !state.run || state.phase !== 'COUNT_IN' || event.purpose !== state.run.purpose) return state;
      return { ...state, phase: event.purpose === 'preview' ? 'PREVIEW_PLAYING' : event.purpose === 'performance' ? 'PERFORMING' : 'CALIBRATING', effects: [] };
    case 'BAR_COMPLETE':
      if (!matches(state, state.run, event) || !state.run || !['PREVIEW_PLAYING', 'PERFORMING', 'CALIBRATING'].includes(state.phase)) return state;
      return state.run.purpose === 'preview' ? { ...state, phase: 'EDITING', run: undefined, effects: [] } : { ...state, run: { ...state.run, barComplete: true }, effects: [] };
    case 'TAP': {
      if (!matches(state, state.run, event) || !state.run || !['COUNT_IN', 'PERFORMING', 'CALIBRATING'].includes(state.phase) || state.run.purpose === 'preview' || !Number.isFinite(event.timestampMs)) return state;
      const bounds = event.inputBounds??state.run.inputBounds;
      if (!bounds || event.timestampMs < bounds.rawStartMs || event.timestampMs > bounds.rawEndMs) return state;
      if (state.run.rawTapsMs.length >= 64) return { ...withoutPending(state), phase: 'INTERRUPTED', performanceResult: { targets: 0, matched: 0, missed: 0, extras: 0, confidence: 'invalidated' }, effects: [{ type: 'stopAudio', runId: state.run.runId }] };
      return { ...state, run: { ...state.run,inputBounds:bounds, rawTapsMs: [...state.run.rawTapsMs, event.timestampMs] }, effects: [] };
    }
    case 'INPUT_WINDOW_CLOSED': {
      if (!matches(state, state.run, event) || !state.run || !['PERFORMING', 'CALIBRATING'].includes(state.phase) || !state.run.barComplete) return state;
      const bounds = event.inputBounds??state.run.inputBounds;
      if (!bounds || !Number.isFinite(event.nowMs) || event.nowMs < Math.max(bounds.barEndMs, bounds.rawEndMs)) return state;
      return { ...state, phase: state.run.purpose === 'calibration' ? 'CALIBRATION_RESULT' : 'PERFORMANCE_RESULT', effects: [{ type: state.run.purpose === 'calibration' ? 'calculateCalibration' : 'calculatePerformance', request: state.run }] };
    }
    case 'PERFORMANCE_RESULT_READY':
      if (!matches(state, state.run, event) || state.phase !== 'PERFORMANCE_RESULT') return state;
      return { ...state, performanceResult: event.result, effects: [] };
    case 'CLOSE_RESULT': return renewInvalidatedSave(state, { ...withoutPending(state), phase: state.editor.puzzle && state.progress[state.editor.puzzle.id]?.objectivePass ? 'THEORY_PASSED' : 'EDITING', performanceResult: undefined });
    case 'SUBMIT': {
      if (!state.editor.puzzle || !['EDITING', 'FEEDBACK', 'THEORY_PASSED', 'INTERRUPTED'].includes(state.phase)) return state;
      const request = snapshotRequest(state, 'validate');
      return requestSave({ ...withoutPending(state), serial: state.serial + 1, phase: 'VALIDATING', validation: request, feedback: undefined, effects: [{ type: 'validate', request }] });
    }
    case 'VALIDATION_DONE': {
      if (!matches(state, state.validation, event) || !state.validation || state.phase !== 'VALIDATING' || !state.editor.puzzle) return state;
      if (event.result.contentError) return { ...state, phase: 'CONTENT_ERROR', feedback: event.result, validation: undefined, effects: [] };
      const puzzle = state.editor.puzzle;
      const prior = state.progress[puzzle.id];
      const passed = event.result.structurePass && event.result.objectivePass;
      const signature = fullSignature(state.validation.snapshot.events);
      const progress: PuzzleProgress = {
        puzzleId: puzzle.id, puzzleVersion: puzzle.version, objectivePass: prior?.objectivePass === true || passed,
        explanationReviewed: prior?.explanationReviewed ?? false,
        completedBy: passed ? state.assistance : prior?.completedBy ?? 'notCompleted', mode: passed ? state.mode : prior?.mode ?? state.mode,
        attempts: (prior?.attempts ?? 0) + 1,
        ...(passed ? { bestTheorySnapshot: state.validation.snapshot } : prior?.bestTheorySnapshot ? { bestTheorySnapshot: prior.bestTheorySnapshot } : {}),
        discoveredSignatures: passed ? [...new Set([...(prior?.discoveredSignatures ?? []), signature])] : prior?.discoveredSignatures ?? [],
      };
      // Persist objective success immediately, before any explanation or motor practice.
      return requestSave({ ...state, phase: 'FEEDBACK', validation: undefined, feedback: event.result, progress: { ...state.progress, [puzzle.id]: progress }, effects: [] });
    }
    case 'ACCEPT_EXPLANATION': {
      const puzzle = state.editor.puzzle;
      if (!puzzle || isPlaybackPhase(state.phase) || !state.progress[puzzle.id]?.objectivePass) return state;
      return requestSave({ ...state, phase: 'THEORY_PASSED', progress: { ...state.progress, [puzzle.id]: { ...state.progress[puzzle.id], explanationReviewed: true } }, effects: [] });
    }
    case 'REQUEST_SAVE': return requestSave({ ...state, effects: [] });
    case 'SAVE_STARTED': return matches(state, state.saveRequest, event) ? { ...state, saving: 'saving', effects: [] } : state;
    case 'SAVE_SUCCEEDED': return matches(state, state.saveRequest, event) ? { ...state, saving: 'clean', savedRevision: event.documentRevision, saveRequest: undefined, storageError: undefined, effects: [] } : state;
    case 'SAVE_FAILED': return matches(state, state.saveRequest, event) ? { ...state, saving: 'failed', saveRequest: undefined, storageError: event.message, effects: [] } : state;
    case 'SET_ASSISTANCE': {
      const rank = { independent: 0, hinted: 1, solutionViewed: 2 };
      return rank[event.assistance] < rank[state.assistance] ? state : { ...state, assistance: event.assistance, effects: [] };
    }
    case 'SET_MODE': return { ...state, mode: event.mode, effects: [] };
    case 'STOP': case 'HIDDEN': case 'INTERRUPTED': case 'LEAVE': {
      const next = withoutPending(state);
      const effects: SessionEffect[] = state.run ? [{ type: 'stopAudio', runId: state.run.runId }] : [];
      const stopped = { ...next, serial: state.serial + 1, phase: event.type === 'LEAVE' ? 'HOME' as const : 'INTERRUPTED' as const, effects };
      return event.type === 'LEAVE' ? requestSave(stopped) : renewInvalidatedSave(state, stopped);
    }
    case 'CONTENT_ERROR': return { ...withoutPending(state), phase: 'CONTENT_ERROR', error: event.error, effects: state.run ? [{ type: 'stopAudio', runId: state.run.runId }] : [] };
  }
}
