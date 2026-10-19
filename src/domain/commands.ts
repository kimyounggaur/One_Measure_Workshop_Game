import { validatePuzzleEdit } from './constraints';
import { diagnostic, DomainError } from './errors';
import type { Diagnostic } from './errors';
import { analyzeCoverage } from './rhythm';
import { MVP_DURATIONS, ticksToFraction, validateProductTempo } from './time';
import type { EventKind, Puzzle, RhythmDocument, RhythmEvent } from './types';
import { parseDocument, validateDocument } from './validation';

export const HISTORY_LIMIT = 100;
export type EditorState = {
  document: RhythmDocument;
  past: RhythmDocument[];
  future: RhythmDocument[];
  puzzle?: Puzzle;
};
export type EditorCommand =
  | { type: 'place'; event: RhythmEvent }
  | { type: 'replaceEvents'; events: RhythmEvent[] }
  | { type: 'move'; id: string; startTick: number }
  | { type: 'resize'; id: string; durationTick: number }
  | { type: 'delete'; id: string }
  | { type: 'replaceKind'; id: string; kind: EventKind }
  | { type: 'splitAndRearticulate'; id: string }
  | { type: 'mergeAdjacentRests'; ids: [string, string] }
  | { type: 'fillGapsWithRests' }
  | { type: 'clear' }
  | { type: 'setTempo'; bpm: number }
  | { type: 'setTitle'; title: string }
  | { type: 'undo' }
  | { type: 'redo' };
export type CommandResult = { state: EditorState; error?: Diagnostic; committed: boolean };

export function createEditor(document: RhythmDocument, puzzle?: Puzzle): EditorState {
  const validated = parseDocument(document);
  const errors = puzzle ? validatePuzzleEdit(puzzle, validated.events) : [];
  if (errors.length) throw new DomainError(errors[0].code, errors[0].message);
  return { document: validated, past: [], future: [], ...(puzzle ? { puzzle: structuredClone(puzzle) } : {}) };
}

function fail(state: EditorState, code: Diagnostic['code'], conditionId: string, message?: string): CommandResult {
  return { state, committed: false, error: diagnostic(code, { conditionId }, message) };
}
function sameContent(left: RhythmDocument, right: RhythmDocument): boolean {
  return JSON.stringify({ ...left, revision: 0, updatedAt: '' }) === JSON.stringify({ ...right, revision: 0, updatedAt: '' });
}
function freshId(events: RhythmEvent[], revision: number, label: string): string {
  let suffix = 1;
  while (events.some(event => event.id === `edit-${revision}-${label}-${suffix}`)) suffix++;
  return `edit-${revision}-${label}-${suffix}`;
}

/** Pure transaction. Pass the user-intent timestamp as updatedAt when recording a real edit. */
export function executeCommand(state: EditorState, command: EditorCommand, puzzle = state.puzzle, updatedAt = state.document.updatedAt): CommandResult {
  const current = state.document;
  if (!Number.isSafeInteger(current.revision + 1)) return fail(state, 'E_SCHEMA', 'revision-overflow');
  const lockedIds = new Set(puzzle?.initialEvents.filter(event => event.locked).map(event => event.id));
  const targetedIds = 'id' in command ? [command.id] : command.type === 'mergeAdjacentRests' ? command.ids : [];
  if (targetedIds.some(id => lockedIds.has(id))) return fail(state, 'E_LOCKED', 'lockedUnchanged');
  if (targetedIds.some(id => !current.events.some(event => event.id === id))) return fail(state, 'E_SCHEMA', 'missing-event', '선택한 조각을 찾을 수 없어요.');
  let candidate = structuredClone(current);
  const event = 'id' in command ? candidate.events.find(item => item.id === command.id) : undefined;
  try {
    switch (command.type) {
      case 'place': candidate.events.push(structuredClone(command.event)); break;
      case 'replaceEvents': candidate.events = structuredClone(command.events); break;
      // Replacing the old position before validating permits a move across its own old span.
      case 'move': if (event) event.startTick = command.startTick; break;
      case 'resize':
        if (event) { event.durationTick = command.durationTick; event.sourceValue = ticksToFraction(command.durationTick); }
        break;
      case 'delete': candidate.events = candidate.events.filter(item => item.id !== command.id); break;
      case 'replaceKind':
        if (event) { event.kind = command.kind; if (command.kind === 'note') event.pitch = 60; else delete event.pitch; }
        break;
      case 'splitAndRearticulate': {
        if (!event || ![480, 960, 1920].includes(event.durationTick)) return fail(state, 'E_DURATION', 'supported-split', '이 조각은 더 나눌 수 없어요.');
        const durationTick = event.durationTick / 2;
        candidate.events = candidate.events.filter(item => item.id !== event.id);
        for (let part = 0; part < 2; part++) candidate.events.push({
          ...event, id: freshId(candidate.events, current.revision + 1, 'split'),
          startTick: event.startTick + part * durationTick, durationTick, sourceValue: ticksToFraction(durationTick),
        });
        break;
      }
      case 'mergeAdjacentRests': {
        const selected = candidate.events.filter(item => command.ids.includes(item.id)).sort((a, b) => a.startTick - b.startTick);
        if (selected.length !== 2 || selected.some(item => item.kind !== 'rest')) return fail(state, 'E_DURATION', 'rest-merge-only', '음표는 합치지 않아요. 인접한 쉼표 두 개를 골라 주세요.');
        const [first, second] = selected;
        const durationTick = first.durationTick + second.durationTick;
        if (first.startTick + first.durationTick !== second.startTick || !MVP_DURATIONS.some(value => value === durationTick)) return fail(state, 'E_DURATION', 'supported-rest-merge', '서로 붙어 있고 지원하는 길이가 되는 쉼표만 합칠 수 있어요.');
        candidate.events = candidate.events.filter(item => !command.ids.includes(item.id));
        candidate.events.push({ id: freshId(candidate.events, current.revision + 1, 'merge'), kind: 'rest', startTick: first.startTick, durationTick, sourceValue: ticksToFraction(durationTick) });
        break;
      }
      case 'fillGapsWithRests': {
        if (puzzle) return fail(state, 'E_PALETTE', 'free-mode-only', '빈칸을 쉼으로 채우기는 자유 조립에서만 사용할 수 있어요.');
        for (const gap of analyzeCoverage(candidate.events).gaps) {
          let cursor = gap.startTick;
          while (cursor < gap.endTick) {
            const durationTick = [1920, 960, 480, 240].find(value => value <= gap.endTick - cursor);
            if (!durationTick) return fail(state, 'E_SCHEMA', 'grid-gap');
            candidate.events.push({ id: freshId(candidate.events, current.revision + 1, 'rest'), kind: 'rest', startTick: cursor, durationTick, sourceValue: ticksToFraction(durationTick) });
            cursor += durationTick;
          }
        }
        break;
      }
      case 'clear': candidate.events = candidate.events.filter(item => lockedIds.has(item.id)); break;
      case 'setTempo': {
        const tempo = { bpm: command.bpm, beatUnit: { num: 1, den: 4 } };
        validateProductTempo(tempo, 'free');
        if (puzzle && (tempo.bpm < puzzle.tempo.minBpm || tempo.bpm > puzzle.tempo.maxBpm)) return fail(state, 'INVALID_TEMPO', 'puzzle-tempo', '이번 문제에서 사용할 수 있는 빠르기를 골라 주세요.');
        candidate.tempo = tempo;
        break;
      }
      case 'setTitle': candidate.title = command.title; break;
      case 'undo': {
        const previous = state.past.at(-1);
        if (!previous) return { state, committed: false };
        candidate = structuredClone(previous);
        break;
      }
      case 'redo': {
        const next = state.future.at(-1);
        if (!next) return { state, committed: false };
        candidate = structuredClone(next);
        break;
      }
      default: return fail(state, 'E_SCHEMA', 'unknown-command', '지원하지 않는 편집 명령이에요.');
    }
  } catch (error) {
    return fail(state, error instanceof DomainError ? error.code : 'E_SCHEMA', 'invalid-command', error instanceof Error ? error.message : undefined);
  }
  candidate.revision = current.revision + 1;
  candidate.updatedAt = updatedAt;
  const validated = validateDocument(candidate);
  const errors = validated.ok && puzzle ? validatePuzzleEdit(puzzle, candidate.events) : validated.diagnostics;
  if (errors.length || !validated.ok) return { state, error: errors[0] ?? diagnostic('E_SCHEMA'), committed: false };
  if (sameContent(current, candidate)) return { state, committed: false };
  const snapshot = structuredClone(current);
  const past = command.type === 'undo' ? state.past.slice(0, -1) : [...state.past, snapshot].slice(-HISTORY_LIMIT);
  const future = command.type === 'undo' ? [...state.future, snapshot].slice(-HISTORY_LIMIT) : command.type === 'redo' ? state.future.slice(0, -1) : [];
  return { state: { ...state, document: candidate, past, future }, committed: true };
}

/** A ghost/confirmation preview never commits or appends history. */
export function previewCommand(state: EditorState, command: EditorCommand, puzzle = state.puzzle): { document?: RhythmDocument; error?: Diagnostic; changed: boolean } {
  const result = executeCommand(state, command, puzzle);
  return result.error ? { error: result.error, changed: false } : { document: { ...result.state.document, revision: state.document.revision }, changed: result.committed };
}
