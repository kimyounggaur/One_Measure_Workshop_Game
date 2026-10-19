import { DomainError } from './errors';
import { ticksToFraction, UNIT_TICKS, WHOLE_TICKS } from './time';
import type { PaletteId, RhythmDocument, RhythmEvent, SemanticEvent, Span } from './types';
import { MVP_METER } from './meter';

export const PALETTE: Record<PaletteId, { kind: 'note' | 'rest'; durationTick: number; name: string }> = {
  N1: { kind: 'note', durationTick: 240, name: '8분음표' },
  N2: { kind: 'note', durationTick: 480, name: '4분음표' },
  N4: { kind: 'note', durationTick: 960, name: '2분음표' },
  N8: { kind: 'note', durationTick: 1920, name: '온음표' },
  R1: { kind: 'rest', durationTick: 240, name: '8분쉼표' },
  R2: { kind: 'rest', durationTick: 480, name: '4분쉼표' },
  R4: { kind: 'rest', durationTick: 960, name: '2분쉼표' },
  R8: { kind: 'rest', durationTick: 1920, name: '온쉼표' },
};
export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && Object.hasOwn(PALETTE, value);
}
export function eventFromPalette(token: PaletteId, startTick: number, id: string): RhythmEvent {
  const item = PALETTE[token];
  return { id, kind: item.kind, startTick, durationTick: item.durationTick, sourceValue: ticksToFraction(item.durationTick), ...(item.kind === 'note' ? { pitch: 60 as const } : {}) };
}
export function paletteId(event: Pick<RhythmEvent, 'kind' | 'durationTick'>): PaletteId {
  const token = `${event.kind === 'note' ? 'N' : 'R'}${event.durationTick / UNIT_TICKS}`;
  if (!isPaletteId(token)) throw new DomainError('UNSUPPORTED_MVP_DURATION', 'Event is not a supported palette value.');
  return token;
}
export function eventsFromTokens(tokens: readonly PaletteId[], prefix = 'event', startTick = 0): RhythmEvent[] {
  let cursor = startTick;
  return tokens.map((token, index) => {
    const event = eventFromPalette(token, cursor, `${prefix}-${index + 1}`);
    cursor += event.durationTick;
    return event;
  });
}
export function createDocument(events: RhythmEvent[] = [], id = 'draft', bpm = 80, now = new Date().toISOString()): RhythmDocument {
  return { schemaVersion: 1, id, contentVersion: '1', revision: 0, ppq: 480, meter: { ...MVP_METER, groupUnits: [...MVP_METER.groupUnits] }, tempo: { bpm, beatUnit: { num: 1, den: 4 } }, events: structuredClone(events), createdAt: now, updatedAt: now };
}

export type Coverage = {
  soundingTicks: number;
  restTicks: number;
  unknownTicks: number;
  gaps: Span[];
  fullCoverage: boolean;
};
/** Requires structurally valid, nonoverlapping events. Unknown is never stored as a rest. */
export function analyzeCoverage(events: readonly SemanticEvent[], barTicks = WHOLE_TICKS): Coverage {
  let cursor = 0;
  let soundingTicks = 0;
  let restTicks = 0;
  const gaps: Span[] = [];
  for (const event of [...events].sort((a, b) => a.startTick - b.startTick)) {
    const end = event.startTick + event.durationTick;
    if (event.startTick < 0 || end > barTicks) throw new DomainError('E_OVERFLOW', 'Coverage requires events inside the bar.');
    if (event.startTick < cursor) throw new DomainError('E_OVERLAP', 'Coverage requires nonoverlapping events.');
    if (event.startTick > cursor) gaps.push({ startTick: cursor, endTick: event.startTick });
    if (event.kind === 'note') soundingTicks += event.durationTick;
    else restTicks += event.durationTick;
    cursor = end;
  }
  if (cursor < barTicks) gaps.push({ startTick: cursor, endTick: barTicks });
  const unknownTicks = gaps.reduce((sum, gap) => sum + gap.endTick - gap.startTick, 0);
  return { soundingTicks, restTicks, unknownTicks, gaps, fullCoverage: unknownTicks === 0 };
}

/** Semantic rest spans can have a non-palette duration; source editing events stay unchanged. */
export function canonicalize(events: readonly SemanticEvent[]): SemanticEvent[] {
  const result: SemanticEvent[] = [];
  for (const event of [...events].sort((a, b) => a.startTick - b.startTick)) {
    const previous = result.at(-1);
    if (event.kind === 'rest' && previous?.kind === 'rest' && previous.startTick + previous.durationTick === event.startTick) {
      previous.durationTick += event.durationTick;
    } else {
      result.push({ kind: event.kind, startTick: event.startTick, durationTick: event.durationTick, ...(event.kind === 'note' ? { pitch: event.pitch } : {}) });
    }
  }
  return result;
}
export function inventory(events: readonly RhythmEvent[]): Partial<Record<PaletteId, number>> {
  const counts: Partial<Record<PaletteId, number>> = {};
  for (const event of events) {
    const token = paletteId(event);
    counts[token] = (counts[token] ?? 0) + 1;
  }
  return counts;
}
