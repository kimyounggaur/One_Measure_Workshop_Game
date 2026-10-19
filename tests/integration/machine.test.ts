import { describe, expect, it } from 'vitest';
import { getPuzzle } from '../../src/content';
import { gradePuzzle } from '../../src/domain/grading';
import { createDocument, eventFromPalette, eventsFromTokens } from '../../src/domain/rhythm';
import { createSessionState, sessionReducer } from '../../src/app/sessionReducer';
import { selectNextUnlocked } from '../../src/app/selectors';
import type { AsyncIdentity, RunPurpose, SessionState } from '../../src/app/machine';

const now = '2026-10-19T00:00:00.000Z';
const make = () => createSessionState(createDocument(eventsFromTokens(['N2', 'N2', 'N2', 'N2']), 'session', 80, now));
const identity = (state: SessionState): AsyncIdentity => ({ runId: state.run!.runId, documentRevision: state.run!.documentRevision });
const ready = (purpose: RunPurpose) => {
  let state = sessionReducer(make(), { type: purpose === 'preview' ? 'PLAY_PREVIEW' : purpose === 'performance' ? 'PLAY_PERFORMANCE' : 'START_CALIBRATION' });
  state = sessionReducer(state, { type: 'AUDIO_READY', ...identity(state), inputBounds: { rawStartMs: 590, rawEndMs: 4410, barEndMs: 4000 } });
  return state;
};

describe('session machine R06/R10/R17', () => {
  it('boots through loading to home or recovery', () => {
    const boot = createSessionState(make().editor.document, undefined, 'BOOT');
    const loading = sessionReducer(boot, { type: 'LOAD_LOCAL' });
    expect(loading.phase).toBe('LOADING_LOCAL');
    expect(sessionReducer(loading, { type: 'LOCAL_READY' }).phase).toBe('HOME');
    expect(sessionReducer(loading, { type: 'LOCAL_READY', recovery: true }).phase).toBe('RECOVERY');
  });

  it('PLAY 10 times has one pending run, frozen independent snapshot, STOP rejects late ready', () => {
    const source = make();
    let state = source;
    for (let count = 0; count < 10; count++) state = sessionReducer(state, { type: 'PLAY_PREVIEW' });
    expect(state.serial).toBe(2); // One audio request and one immediate draft-save request.
    expect(state.effects.filter(effect => effect.type === 'prepareAudio')).toHaveLength(1);
    expect(state.run!.snapshot).not.toBe(source.editor.document);
    expect(Object.isFrozen(state.run!.snapshot.events[0].sourceValue)).toBe(true);
    const stale = identity(state);
    state = sessionReducer(state, { type: 'STOP' });
    expect(state.run).toBeUndefined();
    expect(sessionReducer(state, { type: 'AUDIO_READY', ...stale })).toBe(state);
  });

  it.each<[RunPurpose, string]>([['preview', 'PREVIEW_PLAYING'], ['performance', 'PERFORMING'], ['calibration', 'CALIBRATING']])('COUNT_IN %s enters only its purpose', (purpose, expected) => {
    const state = ready(purpose);
    expect(state.phase).toBe('COUNT_IN');
    const wrong = purpose === 'preview' ? 'performance' : 'preview';
    expect(sessionReducer(state, { type: 'COUNT_IN_ENDED', purpose: wrong, ...identity(state) })).toBe(state);
    expect(sessionReducer(state, { type: 'COUNT_IN_ENDED', purpose, ...identity(state) }).phase).toBe(expected);
  });

  it('model/A-B preview freezes supplied events at current tempo without editing the draft', () => {
    const original = make();
    const previewEvents = eventsFromTokens(['N4', 'R4']);
    const state = sessionReducer(original, { type: 'PLAY_PREVIEW', previewEvents });
    expect(state.editor).toBe(original.editor);
    expect(state.run!.snapshot.events).toEqual(previewEvents);
    expect(state.run!.snapshot.events).not.toBe(previewEvents);
    expect(state.run!.snapshot.tempo).toEqual(original.editor.document.tempo);
    expect(state.run!.documentRevision).toBe(original.editor.document.revision);
    expect(sessionReducer(original, { type: 'PLAY_PREVIEW', previewEvents: [eventFromPalette('N8', 240, 'bad')] })).toBe(original);
  });

  it('negative-offset early input survives count-in; BAR_COMPLETE waits for late grace closure', () => {
    let state = ready('performance');
    const id = identity(state);
    state = sessionReducer(state, { type: 'TAP', timestampMs: 750, ...id });
    expect(state.run!.rawTapsMs).toEqual([750]);
    expect(sessionReducer(state, { type: 'TAP', timestampMs: 589.999, ...id })).toBe(state);
    state = sessionReducer(state, { type: 'COUNT_IN_ENDED', purpose: 'performance', ...id });
    state = sessionReducer(state, { type: 'BAR_COMPLETE', ...id });
    expect(state.phase).toBe('PERFORMING');
    expect(state.performanceResult).toBeUndefined();
    expect(sessionReducer(state, { type: 'INPUT_WINDOW_CLOSED', nowMs: 4409.999, ...id })).toBe(state);
    state = sessionReducer(state, { type: 'TAP', timestampMs: 4300, ...id });
    state = sessionReducer(state, { type: 'INPUT_WINDOW_CLOSED', nowMs: 4410, ...id });
    expect(state.phase).toBe('PERFORMANCE_RESULT');
    expect(state.effects[0].type).toBe('calculatePerformance');
    expect(state.run!.rawTapsMs).toEqual([750, 4300]);
  });

  it('save failures keep the playback phase; stale completions cannot replace current save state', () => {
    let state = ready('preview');
    state = sessionReducer(state, { type: 'REQUEST_SAVE' });
    const id = state.saveRequest!;
    state = sessionReducer(state, { type: 'SAVE_STARTED', ...id });
    const phase = state.phase;
    state = sessionReducer(state, { type: 'SAVE_FAILED', ...id, message: 'quota' });
    expect(state.phase).toBe(phase);
    expect(state.saving).toBe('failed');
    expect(state.run).toBeDefined();
    state = sessionReducer(state, { type: 'REQUEST_SAVE' });
    expect(sessionReducer(state, { type: 'SAVE_SUCCEEDED', ...id })).toBe(state);
  });

  it('retry from a completed result creates a fresh run and rejects the prior result callback', () => {
    let state = ready('performance');
    const old = identity(state);
    state = sessionReducer(state, { type: 'COUNT_IN_ENDED', purpose: 'performance', ...old });
    state = sessionReducer(state, { type: 'BAR_COMPLETE', ...old });
    state = sessionReducer(state, { type: 'INPUT_WINDOW_CLOSED', nowMs: 4410, ...old });
    state = sessionReducer(state, { type: 'PLAY_PERFORMANCE' });
    expect(state.phase).toBe('PERFORMANCE_PREPARING');
    expect(state.run!.runId).not.toBe(old.runId);
    expect(state.run!.rawTapsMs).toEqual([]);
    expect(state.effects.map(effect => effect.type)).toEqual(['stopAudio', 'prepareAudio', 'save']);
    expect(sessionReducer(state, { type: 'PERFORMANCE_RESULT_READY', ...old, result: { targets: 4, matched: 4, missed: 0, extras: 0, confidence: 'normal' } })).toBe(state);
  });

  it('a new run replaces an invalidated in-flight save so pending cannot become orphaned', () => {
    let state = sessionReducer(make(), { type: 'REQUEST_SAVE' });
    const old = state.saveRequest!;
    state = sessionReducer(state, { type: 'SAVE_STARTED', ...old });
    state = sessionReducer(state, { type: 'PLAY_PREVIEW' });
    expect(state.saveRequest).toBeDefined();
    expect(state.saveRequest!.runId).not.toBe(old.runId);
    expect(state.effects.some(effect => effect.type === 'save')).toBe(true);
    expect(sessionReducer(state, { type: 'SAVE_SUCCEEDED', ...old })).toBe(state);
    state = sessionReducer(state, { type: 'SAVE_SUCCEEDED', ...state.saveRequest! });
    expect(state.saving).toBe('clean');
    expect(state.phase).toBe('PREVIEW_PREPARING');
  });

  it('same-document reload maintains generation so old AUDIO_READY/VALIDATION_DONE/SAVE cannot apply', () => {
    let state = sessionReducer(make(), { type: 'PLAY_PREVIEW' });
    const old = identity(state);
    state = sessionReducer(state, { type: 'LOAD_DOCUMENT', document: make().editor.document });
    state = sessionReducer(state, { type: 'PLAY_PREVIEW' });
    expect(identity(state)).not.toEqual(old);
    expect(sessionReducer(state, { type: 'AUDIO_READY', ...old })).toBe(state);
    state = sessionReducer(state, { type: 'REQUEST_SAVE' });
    const oldSave = state.saveRequest!;
    state = sessionReducer(state, { type: 'STOP' });
    expect(sessionReducer(state, { type: 'SAVE_SUCCEEDED', ...oldSave })).toBe(state);
  });

  it('an interruption queued before document replacement cannot interrupt the loaded document', () => {
    let state = sessionReducer(make(), { type: 'PLAY_PREVIEW' });
    const stale = identity(state);
    state = sessionReducer(state, { type: 'LOAD_DOCUMENT', document: make().editor.document });
    const loaded = state;
    state = sessionReducer(state, { type: 'AUDIO_INTERRUPTED', ...stale, reason: 'late visibility callback' });
    expect(state).toBe(loaded);
    expect(state.phase).toBe('EDITING');
  });

  it('an interruption queued for the stopped run cannot interrupt the newer run', () => {
    let state = sessionReducer(make(), { type: 'PLAY_PREVIEW' });
    const stale = identity(state);
    state = sessionReducer(state, { type: 'STOP' });
    state = sessionReducer(state, { type: 'PLAY_PREVIEW' });
    const newer = state;
    state = sessionReducer(state, { type: 'AUDIO_INTERRUPTED', ...stale, reason: 'old resume failed' });
    expect(state).toBe(newer);
    expect(state.phase).toBe('PREVIEW_PREPARING');
    expect(state.run!.runId).not.toBe(stale.runId);
  });

  it.each(['stop', 'failed-resume'] as const)('%s allows silent theory submission immediately without a dummy edit', cause => {
    const puzzle = getPuzzle('measure-01');
    let state = createSessionState(createDocument(eventsFromTokens(['N2', 'N2', 'N2', 'N2']), 'silent-theory', 72, now), puzzle);
    state = sessionReducer(state, { type: 'PLAY_PREVIEW' });
    const active = identity(state);
    state = cause === 'stop'
      ? sessionReducer(state, { type: 'STOP' })
      : sessionReducer(state, { type: 'AUDIO_INTERRUPTED', ...active, reason: 'resume unavailable' });
    expect(state.phase).toBe('INTERRUPTED');
    const document = state.editor.document;
    state = sessionReducer(state, { type: 'SUBMIT' });
    expect(state.phase).toBe('VALIDATING');
    expect(state.editor.document).toBe(document);
    expect(state.validation?.snapshot.events).toEqual(document.events);
    state = sessionReducer(state, { type: 'VALIDATION_DONE', ...state.validation!, result: gradePuzzle(puzzle, document.events) });
    expect(state.progress[puzzle.id].objectivePass).toBe(true);
  });

  it('B24 objective success persists before explanation and poor tap results never revoke unlock', () => {
    const puzzle = getPuzzle('measure-04');
    let state = createSessionState(createDocument(eventsFromTokens(['N2', 'N4', 'N2']), puzzle.id, 72, now), puzzle);
    state = sessionReducer(state, { type: 'SUBMIT' });
    state = sessionReducer(state, { type: 'VALIDATION_DONE', ...state.validation!, result: gradePuzzle(puzzle, state.editor.document.events) });
    expect(state.phase).toBe('FEEDBACK');
    expect(selectNextUnlocked(state, puzzle.id)).toBe(true);
    expect(state.progress[puzzle.id].explanationReviewed).toBe(false);
    expect(state.effects[0].type).toBe('save');
    expect(state.progress[puzzle.id].bestTheorySnapshot!.events.map(event => event.durationTick)).toEqual([480, 960, 480]);
    state = sessionReducer(state, { type: 'PLAY_PERFORMANCE' });
    const id = identity(state);
    state = sessionReducer(state, { type: 'AUDIO_READY', ...id, inputBounds: { rawStartMs: 0, rawEndMs: 4200, barEndMs: 4000 } });
    state = sessionReducer(state, { type: 'COUNT_IN_ENDED', purpose: 'performance', ...id });
    state = sessionReducer(state, { type: 'BAR_COMPLETE', ...id });
    state = sessionReducer(state, { type: 'INPUT_WINDOW_CLOSED', nowMs: 4200, ...id });
    state = sessionReducer(state, { type: 'PERFORMANCE_RESULT_READY', ...id, result: { targets: 3, matched: 0, missed: 3, extras: 2, confidence: 'lowConfidence' } });
    expect(state.progress[puzzle.id].objectivePass).toBe(true);
    expect(state.progress[puzzle.id].explanationReviewed).toBe(false);
  });

  it('late validation for an edited revision is ignored and system errors do not count attempts', () => {
    const puzzle = getPuzzle('measure-01');
    let state = createSessionState(createDocument(eventsFromTokens(['N2', 'N2', 'N2', 'N2']), 'validation', 72, now), puzzle);
    state = sessionReducer(state, { type: 'SUBMIT' });
    const old = state.validation!;
    const result = gradePuzzle(puzzle, old.snapshot.events);
    state = sessionReducer(state, { type: 'EDIT_COMMAND', command: { type: 'delete', id: 'event-1' } });
    expect(sessionReducer(state, { type: 'VALIDATION_DONE', ...old, result })).toBe(state);
    expect(state.progress[puzzle.id]).toBeUndefined();
    state = sessionReducer(state, { type: 'SUBMIT' });
    state = sessionReducer(state, { type: 'VALIDATION_DONE', ...state.validation!, result: { ...result, contentError: true } });
    expect(state.phase).toBe('CONTENT_ERROR');
    expect(state.progress[puzzle.id]).toBeUndefined();
  });

  it.each(['POINTER_CANCEL', 'LOST_POINTER_CAPTURE', 'CANCEL_GHOST', 'ORIENTATION_CHANGE'] as const)('%s clears ghost without changing original data', type => {
    const original = make();
    const state = sessionReducer(original, { type: 'PREVIEW_COMMAND', command: { type: 'delete', id: 'event-1' } });
    expect(state.ghost).toBeDefined();
    const cancelled = sessionReducer(state, { type });
    expect(cancelled.ghost).toBeUndefined();
    expect(cancelled.editor).toBe(original.editor);
  });

  it('selection never edits and invalid drops preserve original document and history', () => {
    const original = make();
    const selected = sessionReducer(original, { type: 'SELECT_EVENT', id: 'event-1' });
    expect(selected.editor).toBe(original.editor);
    const invalid = sessionReducer(selected, { type: 'EDIT_COMMAND', command: { type: 'place', event: eventFromPalette('N2', 1680, 'bad') } });
    expect(invalid.editor).toBe(original.editor);
    expect(invalid.ghost).toBeUndefined();
    expect(invalid.error?.code).toBe('E_OVERFLOW');
  });
});
