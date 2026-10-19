export type Tick = number;
export type Fraction = { num: number; den: number };
export type Tempo = { bpm: number; beatUnit: Fraction };
export type Meter = {
  numerator: number;
  denominator: 2 | 4 | 8 | 16;
  groupUnits: number[];
};
export type EventKind = 'note' | 'rest';
export type PaletteId = 'N1' | 'N2' | 'N4' | 'N8' | 'R1' | 'R2' | 'R4' | 'R8';
export type RhythmEvent = {
  id: string;
  kind: EventKind;
  startTick: Tick;
  durationTick: Tick;
  pitch?: 60;
  sourceValue: Fraction;
  tieNextId?: string;
  locked?: boolean;
};
/** Drawing fragments never introduce sounding onsets. */
export type NotationFragment = { eventId: string; startTick: Tick; durationTick: Tick };
export type RhythmDocument = {
  schemaVersion: 1;
  id: string;
  contentVersion: string;
  revision: number;
  ppq: 480;
  meter: Meter;
  tempo: Tempo;
  events: RhythmEvent[];
  title?: string;
  createdAt: string;
  updatedAt: string;
};
export type Span = { startTick: Tick; endTick: Tick };
export type SemanticEvent = {
  kind: EventKind;
  startTick: Tick;
  durationTick: Tick;
  pitch?: 60;
};
export type Rule =
  | { op: 'fullCoverage' }
  | { op: 'inventory'; counts: Partial<Record<PaletteId, number>> }
  | { op: 'firstKind'; kind: EventKind }
  | { op: 'sameSemanticRhythm'; referenceId: string }
  | { op: 'differentSilence'; referenceId: string }
  | { op: 'lockedUnchanged' };
export type Puzzle = {
  id: string;
  version: number;
  title: string;
  prompt: string;
  tempo: { default: Tempo; minBpm: number; maxBpm: number };
  modelReferenceId?: string;
  objectiveIds: string[];
  meter: Meter;
  gridTick: 240;
  initialEvents: RhythmEvent[];
  palette: PaletteId[];
  constraints: Rule[];
  references: Record<string, RhythmEvent[]>;
  expectedAnswerCount: number;
  modelAvailable: boolean;
  hints: { level: 1 | 2 | 3; text: string; focus?: Span }[];
  explanation: { prompt: string; options: { id: string; text: string }[]; correctId: string };
  expectedConcept: string;
};
